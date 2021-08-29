#! /usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spawn = exports.execFile = exports.resolveAll = exports.resolve = exports.readJSFile = exports.readJSONFile = void 0;
const path = require("path");
const child_process_1 = require("child_process");
const future_1 = require("@quenk/noni/lib/control/monad/future");
const file_1 = require("@quenk/noni/lib/io/file");
/**
 * readJSONFile reads the contents of a file as JSON.
 */
const readJSONFile = (path) => future_1.doFuture(function* () {
    let txt = yield file_1.readTextFile(path);
    return future_1.attempt(() => JSON.parse(txt));
});
exports.readJSONFile = readJSONFile;
/**
 * readFile reads the contents of a js file.
 */
const readJSFile = (path) => future_1.attempt(() => require(path));
exports.readJSFile = readJSFile;
/**
 * resolve a relative string path to the current working directory.
 */
const resolve = (str, cwd = process.cwd()) => path.isAbsolute(str) ? str : path.resolve(cwd, str);
exports.resolve = resolve;
/**
 * resolveAll resolves each path in the list provided.
 */
const resolveAll = (list, cwd = process.cwd()) => list.map(p => exports.resolve(p, cwd));
exports.resolveAll = resolveAll;
/**
 * execFile
 */
const execFile = (path, args = []) => {
    console.error('execing file pa', path);
    return future_1.fromCallback(cb => child_process_1.execFile(path, args, (err, stdout, stderr) => {
        if (stdout)
            console.log(stdout);
        if (stderr)
            console.error(stderr);
        cb(err);
    }));
};
exports.execFile = execFile;
/**
 * spawn
 */
const spawn = (path, args = []) => {
    child_process_1.spawn(path, args, { detached: true });
};
exports.spawn = spawn;
//# sourceMappingURL=filesystem.js.map