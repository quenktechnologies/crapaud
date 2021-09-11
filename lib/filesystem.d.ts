#! /usr/bin/env node
/// <reference types="node" />
import * as json from '@quenk/noni/lib/data/json';
import { Future } from '@quenk/noni/lib/control/monad/future';
/**
 * readJSONFile reads the contents of a file as JSON.
 */
export declare const readJSONFile: (path: string) => Future<json.Object>;
/**
 * readFile reads the contents of a js file.
 */
export declare const readJSFile: (path: string) => Future<json.Object>;
/**
 * resolve a relative string path to the current working directory.
 */
export declare const resolve: (str: string, cwd?: string) => string;
/**
 * resolveAll resolves each path in the list provided.
 */
export declare const resolveAll: (list: string[], cwd?: string) => string[];
/**
 * execFile
 */
export declare const execFile: (path: string, args?: string[]) => Future<unknown>;
/**
 * spawn
 */
export declare const spawn: (path: string, args?: string[]) => Future<import("child_process").ChildProcessWithoutNullStreams>;
