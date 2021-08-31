import { Path } from '@quenk/noni/lib/io/file';
import { BeforeAfterSpec, BeforeAfterEachSpec, ConfObject, TestConf, TransformSpec } from '.';
/**
 * TestSuiteConf contains configuration info for a group of tests.
 */
export interface TestSuiteConf extends ConfObject {
    /**
     * path to the test suite config file.
     *
     * This is computed automatically.
     */
    path: Path;
    /**
     * browser to run the tests in.
     */
    browser: string;
    /**
     * url the web browser will visit and inject tests in.
     */
    url: string;
    /**
     * injectMocha if true, will inject a mochajs script into the url's web
     * page.
     */
    injectMocha: boolean;
    /**
     * mochaOptions that will be stringified and injected into mocha.setup().
     */
    mochaOptions: ConfObject;
    /**
     * before is a list of script paths to execute before testing.
     */
    before: BeforeAfterSpec | BeforeAfterSpec[];
    /**
     * beforeEach is a list of script paths to execute before each test.
     */
    beforeEach: BeforeAfterEachSpec | BeforeAfterEachSpec[];
    /**
     * after is a list of script paths to execute after testing.
     */
    after: BeforeAfterSpec | BeforeAfterSpec[];
    /**
     * afterEach is a list of script paths to execute after each test.
     */
    afterEach: BeforeAfterEachSpec | BeforeAfterEachSpec[];
    /**
     * transform for the test.
     */
    transform?: TransformSpec;
    /**
     * keepOpen if true will attempt to leave the browser window open after
     * a test completes.
     */
    keepOpen: boolean;
    /**
     * tests to execute in this suite.
     */
    tests: TestConf[];
    /**
     * include is a list of other TestSuiteConfs to execute after this one.
     */
    include: Path[];
}
