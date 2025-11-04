"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
(0, globals_1.describe)('constants environment variations', () => {
    const ORIGINAL_ENV = process.env;
    (0, globals_1.beforeEach)(() => {
        jest.resetModules(); // clear module cache
        process.env = { ...ORIGINAL_ENV };
    });
    afterEach(() => {
        process.env = ORIGINAL_ENV;
    });
    (0, globals_1.it)('should expose production environment constants when NODE_ENV=production', () => {
        process.env.NODE_ENV = 'production';
        const constants = require('../../utils/constants');
        (0, globals_1.expect)(constants.IS_PRODUCTION).toBe(true);
        (0, globals_1.expect)(constants.IS_DEVELOPMENT).toBe(false);
    });
    (0, globals_1.it)('should expose development environment constants when NODE_ENV=development', () => {
        process.env.NODE_ENV = 'development';
        const constants = require('../../utils/constants');
        (0, globals_1.expect)(constants.IS_PRODUCTION).toBe(false);
        (0, globals_1.expect)(constants.IS_DEVELOPMENT).toBe(true);
    });
});
//# sourceMappingURL=constants.env.test.js.map