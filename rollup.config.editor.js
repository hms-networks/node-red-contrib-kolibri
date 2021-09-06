/*
* MIT License
*
* Copyright (c) 2020 Alex Kaul
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
* 
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*/


import fs from "fs";
import glob from "glob";
import path from "path";
import typescript from "@rollup/plugin-typescript";

import packageJson from "./package.json";

const allNodeTypes = Object.keys(packageJson["node-red"].nodes);

const htmlBundle = () => {
  return {
    name: "htmlBundle",
    renderChunk(code, chunk, _options) {
      const editorDir = path.dirname(chunk.facadeModuleId);
      const htmlFiles = glob.sync(path.join(editorDir, "*.html"));
      const htmlContents = htmlFiles.map((fPath) => fs.readFileSync(fPath));

      code =
        '<script type="text/javascript">\n' +
        code +
        "\n" +
        "</script>\n" +
        htmlContents.join("\n");

      return {
        code,
        map: { mappings: "" },
      };
    },
  };
};

const makePlugins = (nodeType) => [
  typescript({
    lib: ["es5", "es6", "dom"],
    include: [
      `src/nodes/${nodeType}/${nodeType}.html/**/*.ts`,
      `src/nodes/${nodeType}/shared/**/*.ts`,
      "src/nodes/shared/**/*.ts",
    ],
    target: "es5",
    tsconfig: false,
  }),
  htmlBundle(),
];

const makeConfigItem = (nodeType) => ({
  input: `src/nodes/${nodeType}/${nodeType}.html/index.ts`,
  output: {
    file: `dist/nodes/${nodeType}/${nodeType}.html`,
    format: "iife",
  },
  plugins: makePlugins(nodeType),
});

export default allNodeTypes.map((nodeType) => { return makeConfigItem(nodeType); });
