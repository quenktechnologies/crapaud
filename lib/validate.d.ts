import { Precondition } from '@quenk/preconditions';
import { TestSuiteConf } from './conf/test/suite';
import { ConfValue, TestConf } from './conf/test';
/**
 * validateTestConf validates a single object as a TestConf.
 */
export declare const validateTestConf: Precondition<ConfValue, TestConf>;
/**
 * validateTestSuiteConf validates an entire test suite object.
 */
export declare const validateTestSuiteConf: Precondition<ConfValue, TestSuiteConf>;
