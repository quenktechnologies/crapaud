import { Future } from '@quenk/noni/lib/control/monad/future';
import { TestSuiteConf } from './conf/test/suite';
/**
 * readTestSuiteFile reads a TestSuiteConf at a file path, initializing any
 * unspecified values to their defaults.
 *
 * This will also validate the object before it is returned.
 */
export declare const readTestSuiteFile: (filePath: string) => Future<TestSuiteConf>;
/**
 * readTestSuiteFileDeep takes care of reading a TestSuiteConf and any
 * includes recursively.
 *
 * TODO: This function should be made stack safe at some point.
 */
export declare const readTestSuiteFileDeep: (filePath: string) => Future<TestSuiteConf[]>;
