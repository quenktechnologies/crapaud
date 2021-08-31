import { TestConf } from '.';
import { TestSuiteConf } from './suite';
/**
 * runTest executes a single test given a test configuration spec.
 */
export declare const runTest: (conf: TestConf) => import("@quenk/noni/lib/control/monad/future").Future<void>;
/**
 * runTestSuite runs all the tests within a suite.
 */
export declare const runTestSuite: (conf: TestSuiteConf) => import("@quenk/noni/lib/control/monad/future").Future<undefined>;
/**
 * expandTestConf given a TestSuiteConf and a TestConf will make the TestConf
 * inherit the relevant properties of the TestSuiteConf.
 */
export declare const expandTestConf: (parent: TestSuiteConf, conf: TestConf) => TestConf;
