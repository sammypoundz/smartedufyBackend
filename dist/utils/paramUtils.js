"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStringParam = void 0;
const getStringParam = (param) => {
    if (!param || Array.isArray(param))
        return null;
    return param;
};
exports.getStringParam = getStringParam;
