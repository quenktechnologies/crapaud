import { execFile as _execFile, exec } from 'child_process';

import {
    toPromise,
    doFuture,
    attempt,
    pure
} from '@quenk/noni/lib/control/monad/future';
import { fromCallback } from '@quenk/noni/lib/control/monad/future';
import { isFile } from '@quenk/noni/lib/io/file';

import { assert } from '@quenk/test/lib/assert';

const BIN = `${__dirname}/../lib/main.js`;

const execFile = (path: string, args: string[]) =>
    fromCallback(cb => {

        _execFile(path, args, (err, stdout, stderr) => {

            if (err) return cb(err);

            if (stdout) console.log(stdout);

            if (stderr) console.error(stderr);

            cb(null, undefined);

        });

    });

const main = (args: string[] = []) => execFile(BIN, args);

const rm = (path: string) =>
    fromCallback(cb => exec(`rm -R ${path} || true`, cb));

describe('main', () => {

    it('should work', () => toPromise(doFuture(function*() {

        return main([`${__dirname}/should-work/crapaud.json`]);

    })));

    it('should execute before and after scripts',
        () => toPromise(doFuture(function*() {

            let beforeFile = `${__dirname}/before-after/touchedBefore`;

            let afterFile = `${__dirname}/before-after/touchedAfter`;

            yield rm(beforeFile);

            yield rm(afterFile);

            yield main([`${__dirname}/before-after/crapaud.json`]);

            let beforeFileExists = yield isFile(beforeFile);

            let afterFileExists = yield isFile(afterFile);

            yield attempt(() => {

                assert(beforeFileExists).true();

                assert(afterFileExists).true();

            });

            yield rm(beforeFile);

            yield rm(afterFile);

            return pure(<void>undefined);

        })));

    it('should inherit before and after scripts',
        () => toPromise(doFuture(function*() {

            let beforeFile = `${__dirname}/before-after-inherited/touchedBefore`;

            let afterFile = `${__dirname}/before-after-inherited/touchedAfter`;

            yield rm(beforeFile);

            yield rm(afterFile);

            yield main([`${__dirname}/before-after-inherited/crapaud.json`]);

            let beforeFileExists = yield isFile(beforeFile);

            let afterFileExists = yield isFile(afterFile);

            yield attempt(() => {

                assert(beforeFileExists).true();

                assert(afterFileExists).true();

            });

            //  yield rm(beforeFile);

            //yield rm(afterFile);

            return pure(<void>undefined);

        })));

});