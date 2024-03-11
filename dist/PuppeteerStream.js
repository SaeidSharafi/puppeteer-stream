"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStream = exports.launch = exports.wss = void 0;
const puppeteer_core_1 = require("puppeteer-core");
const path = __importStar(require("path"));
const stream_1 = require("stream");
const ws_1 = __importStar(require("ws"));
const extensionPath = path.join(__dirname, "..", "extension");
const extensionId = "jjndjgheafjngoipoacpjgeicjeomjli";
let currentIndex = 0;
let port;
exports.wss = (async () => {
    for (let i = 55200; i <= 65535; i++) {
        const ws = new ws_1.WebSocketServer({ port: i });
        const promise = await Promise.race([
            new Promise((resolve) => {
                ws.on("error", (e) => {
                    resolve(!e.message.includes("EADDRINUSE"));
                });
            }),
            new Promise((resolve) => {
                ws.on("listening", () => {
                    resolve(true);
                });
            }),
        ]);
        if (promise) {
            port = i;
            return ws;
        }
    }
})();
async function launch(arg1, opts) {
    var _a, _b;
    //if puppeteer library is not passed as first argument, then first argument is options
    // @ts-ignore
    if (typeof arg1.launch != "function")
        opts = arg1;
    if (!opts)
        opts = {};
    if (!opts.args)
        opts.args = [];
    function addToArgs(arg, value) {
        if (!value) {
            if (opts.args.includes(arg))
                return;
            return opts.args.push(arg);
        }
        let found = false;
        opts.args = opts.args.map((x) => {
            if (x.includes(arg)) {
                found = true;
                return x + "," + value;
            }
            return x;
        });
        if (!found)
            opts.args.push(arg + value);
    }
    addToArgs("--load-extension=", extensionPath);
    addToArgs("--disable-extensions-except=", extensionPath);
    addToArgs("--allowlisted-extension-id=", extensionId);
    addToArgs("--autoplay-policy=no-user-gesture-required");
    if (((_a = opts.defaultViewport) === null || _a === void 0 ? void 0 : _a.width) && ((_b = opts.defaultViewport) === null || _b === void 0 ? void 0 : _b.height))
        opts.args.push(`--window-size=${opts.defaultViewport.width},${opts.defaultViewport.height}`);
    opts.headless = false;
    let browser;
    // @ts-ignore
    if (typeof arg1.launch == "function") {
        // @ts-ignore
        browser = await arg1.launch(opts);
    }
    else {
        browser = await (0, puppeteer_core_1.launch)(opts);
    }
    if (opts.allowIncognito) {
        const settings = await browser.newPage();
        await settings.goto(`chrome://extensions/?id=${extensionId}`);
        await settings.evaluate(() => {
            document
                .querySelector("extensions-manager")
                .shadowRoot.querySelector("#viewManager > extensions-detail-view.active")
                .shadowRoot.querySelector("div#container.page-container > div.page-content > div#options-section extensions-toggle-row#allow-incognito")
                .shadowRoot.querySelector("label#label input")
                .click();
        });
        await settings.close();
    }
    (await browser.newPage()).goto(`chrome-extension://${extensionId}/options.html#${port}`);
    return browser;
}
exports.launch = launch;
async function getExtensionPage(browser) {
    const extensionTarget = await browser.waitForTarget((target) => {
        return target.type() === "page" && target.url().startsWith(`chrome-extension://${extensionId}/options.html`);
    });
    if (!extensionTarget)
        throw new Error("cannot load extension");
    const videoCaptureExtension = await extensionTarget.page();
    if (!videoCaptureExtension)
        throw new Error("cannot get page of extension");
    return videoCaptureExtension;
}
let mutex = false;
let queue = [];
function lock() {
    return new Promise((res) => {
        if (!mutex) {
            mutex = true;
            return res(null);
        }
        queue.push(res);
    });
}
function unlock() {
    if (queue.length)
        queue.shift()();
    else
        mutex = false;
}
async function getStream(page, opts) {
    var _a;
    if (!opts.audio && !opts.video)
        throw new Error("At least audio or video must be true");
    if (!opts.mimeType) {
        if (opts.video)
            opts.mimeType = "video/webm";
        else if (opts.audio)
            opts.mimeType = "audio/webm";
    }
    if (!opts.frameSize)
        opts.frameSize = 20;
    const retryPolicy = Object.assign({}, { each: 20, times: 3 }, opts.retry);
    const extension = await getExtensionPage(page.browser());
    const highWaterMarkMB = ((_a = opts.streamConfig) === null || _a === void 0 ? void 0 : _a.highWaterMarkMB) || 8;
    const index = currentIndex++;
    await lock();
    await page.bringToFront();
    const [tab] = await extension.evaluate(async (x) => {
        // @ts-ignore
        return chrome.tabs.query(x);
    }, {
        active: true,
        title: await page.title(),
        url: page.url(),
    });
    if (!tab)
        throw new Error("Cannot find tab");
    unlock();
    console.log(tab);
    const stream = new stream_1.Transform({
        highWaterMark: 1024 * 1024 * highWaterMarkMB,
        transform(chunk, encoding, callback) {
            callback(null, chunk);
        },
    });
    function onConnection(ws, req) {
        const url = new URL(`http://localhost:${port}${req.url}`);
        if (url.searchParams.get("index") != index.toString())
            return;
        async function close() {
            var _a, _b;
            if (!stream.readableEnded && !stream.writableEnded)
                stream.end();
            if (!extension.isClosed() && extension.browser().isConnected()) {
                // @ts-ignore
                extension.evaluate((index) => STOP_RECORDING(index), index);
            }
            if (ws.readyState != ws_1.default.CLOSED) {
                setTimeout(() => {
                    // await pending messages to be sent and then close the socket
                    if (ws.readyState != ws_1.default.CLOSED)
                        ws.close();
                }, (_b = (_a = opts.streamConfig) === null || _a === void 0 ? void 0 : _a.closeTimeout) !== null && _b !== void 0 ? _b : 5000);
            }
            (await exports.wss).off("connection", onConnection);
        }
        ws.on("message", (data) => {
            stream.write(data);
        });
        ws.on("close", close);
        page.on("close", close);
        stream.on("close", close);
    }
    (await exports.wss).on("connection", onConnection);
    await page.bringToFront();
    await assertExtensionLoaded(extension, retryPolicy);
    await extension.evaluate(
    // @ts-ignore
    (settings) => START_RECORDING(settings), Object.assign(Object.assign({}, opts), { index, tabId: tab.id }));
    return stream;
}
exports.getStream = getStream;
async function assertExtensionLoaded(ext, opt) {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    for (let currentTick = 0; currentTick < opt.times; currentTick++) {
        // @ts-ignore
        if (await ext.evaluate(() => typeof START_RECORDING === "function"))
            return;
        await wait(Math.pow(opt.each, currentTick));
    }
    throw new Error("Could not find START_RECORDING function in the browser context");
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHVwcGV0ZWVyU3RyZWFtLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1B1cHBldGVlclN0cmVhbS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLG1EQU93QjtBQUN4QiwyQ0FBNkI7QUFDN0IsbUNBQW1DO0FBQ25DLHlDQUFnRDtBQUdoRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7QUFDOUQsTUFBTSxXQUFXLEdBQUcsa0NBQWtDLENBQUM7QUFDdkQsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDO0FBTXJCLElBQUksSUFBWSxDQUFDO0FBRUosUUFBQSxHQUFHLEdBQUcsQ0FBQyxLQUFLLElBQUksRUFBRTtJQUM5QixLQUFLLElBQUksQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ3BDLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQWUsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sT0FBTyxHQUFHLE1BQU0sT0FBTyxDQUFDLElBQUksQ0FBQztZQUNsQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO2dCQUN2QixFQUFFLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQU0sRUFBRSxFQUFFO29CQUN6QixPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO2dCQUM1QyxDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQztZQUNGLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7Z0JBQ3ZCLEVBQUUsQ0FBQyxFQUFFLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtvQkFDdkIsT0FBTyxDQUFDLElB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