/// <reference types="node" />
/// <reference types="node" />
import { LaunchOptions, Browser, Page, BrowserLaunchArgumentOptions, BrowserConnectOptions } from "puppeteer-core";
import { Transform } from "stream";
import WebSocket from "ws";
import { IncomingMessage } from "http";
declare type StreamLaunchOptions = LaunchOptions & BrowserLaunchArgumentOptions & BrowserConnectOptions & {
    allowIncognito?: boolean;
};
export declare const wss: Promise<WebSocket.Server<typeof WebSocket, typeof IncomingMessage>>;
export declare function launch(arg1: StreamLaunchOptions | {
    launch?: Function;
    [key: string]: any;
}, opts?: StreamLaunchOptions): Promise<Browser>;
export declare type BrowserMimeType = "video/webm" | "video/webm;codecs=vp8" | "video/webm;codecs=vp9" | "video/webm;codecs=vp8.0" | "video/webm;codecs=vp9.0" | "video/webm;codecs=vp8,opus" | "video/webm;codecs=vp8,pcm" | "video/WEBM;codecs=VP8,OPUS" | "video/webm;codecs=vp9,opus" | "video/webm;codecs=vp8,vp9,opus" | "audio/webm" | "audio/webm;codecs=opus" | "audio/webm;codecs=pcm";
export declare type Constraints = {
    mandatory?: MediaTrackConstraints;
    optional?: MediaTrackConstraints;
};
export interface getStreamOptions {
    audio: boolean;
    video: boolean;
    videoConstraints?: Constraints;
    audioConstraints?: Constraints;
    mimeType?: BrowserMimeType;
    audioBitsPerSecond?: number;
    videoBitsPerSecond?: number;
    bitsPerSecond?: number;
    frameSize?: number;
    delay?: number;
    retry?: {
        each?: number;
        times?: number;
    };
    streamConfig?: {
        highWaterMarkMB?: number;
        immediateResume?: boolean;
        closeTimeout?: number;
    };
}
export declare function getStream(page: Page, opts: getStreamOptions): Promise<Transform>;
export {};
