#! /usr/bin/env node

import * as path from 'path';
import * as json from '@quenk/noni/lib/data/json';

import { execFile as _execFile, spawn as _spawn } from 'child_process';

import {
    Future,
    doFuture,
    attempt,
    fromCallback,
} from '@quenk/noni/lib/control/monad/future';
import { readTextFile } from '@quenk/noni/lib/io/file';

/**
 * readJSONFile reads the contents of a file as JSON.
 */
export const readJSONFile = (path: string): Future<json.Object> =>
    doFuture(function*() {

        let txt = yield readTextFile(path);
        return attempt(() => JSON.parse(txt));

    })

/**
 * readFile reads the contents of a js file.
 */
export const readJSFile = (path: string): Future<json.Object> =>
    attempt(() => require(path));

/**
 * resolve a relative string path to the current working directory.
 */
export const resolve = (str: string, cwd = process.cwd()) =>
    path.isAbsolute(str) ? str : path.resolve(cwd, str);

/**
 * resolveAll resolves each path in the list provided.
 */
export const resolveAll = (list: string[], cwd = process.cwd()) =>
    list.map(p => resolve(p, cwd));

/**
 * execFile
 */
export const execFile =
    (path: string, args: string[] = []) => {
        return fromCallback(cb =>
            _execFile(path, args, (err, stdout, stderr) => {

                if (stdout) console.log(stdout);

                if (stderr) console.error(stderr);

                cb(err);

            }));
    }

/**
 * spawn
 */
export const spawn =  (path: string, args: string[] = []) => 
  attempt(()=> _spawn(path, args, { detached: true }));
