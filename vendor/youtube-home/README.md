# YouTube 首页 SDK 构建产物

`page.js` 由 `integrations/youtube-home/build.mjs` 生成，入口为 `page.mjs`。
请修改源文件并重建，不直接编辑此文件。

依赖版本由 `integrations/youtube-home/package-lock.json` 锁定：

- youtubei.js 18.0.0：MIT，`LICENSE.youtubei.js`
- fflate 0.8.3：MIT，`LICENSE.fflate`
- meriyah 7.3.3：ISC，`LICENSE.meriyah`
- @bufbuild/protobuf 2.15.0：Apache-2.0 / BSD-3-Clause，`LICENSE.protobuf-apache` / `LICENSE.protobuf-bsd`

Apache 许可证来自上游固定版本：
https://raw.githubusercontent.com/bufbuild/protobuf-es/v2.15.0/LICENSE

仅作打包转换，未编辑上游库源文件。项目适配代码及验证边界见
`docs/technical/youtube-home-feed-20260922.md`。
