"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandTestConf = void 0;
const path = require("path");
const record_1 = require("@quenk/noni/lib/data/record");
const filesystem_1 = require("../../filesystem");
const defaultTestConf = { before: [], after: [] };
/**
 * expandTestConf given a TestSuiteConf and a TestConf will make the TestConf
 * inherit the relevant properties of the TestSuiteConf.
 */
const expandTestConf = (parent, conf) => expandTestPath(parent, inheritScripts(parent, inheritSuiteConf(parent, record_1.merge(defaultTestConf, conf))));
exports.expandTestConf = expandTestConf;
const inheritedProps = [
    'browser',
    'url',
    'injectMocha',
    'mochaOptions',
    'transform',
    'keepOpen'
];
const inheritSuiteConf = (conf, test) => inheritedProps.reduce((test, prop) => {
    if (!test.hasOwnProperty(prop))
        test[prop] = conf[prop];
    return test;
}, test);
const inheritScripts = (conf, test) => {
    test.before = conf.beforeEach.concat(test.before);
    test.after = conf.afterEach.concat(test.after);
    return test;
};
const expandTestPath = (conf, test) => {
    test.path = filesystem_1.resolve(test.path, path.dirname(conf.path));
    return test;
};
//# sourceMappingURL=index.js.map