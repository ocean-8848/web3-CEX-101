# 学习站构建工具

把本仓库的 `docs/`、`interactive/`、`slides/` 打包成在线学习站：一个单页手册（目录、全文搜索、流程图放大、学习进度），交互实验和幻灯片作为附属文件。

```bash
cd tools/build-site
npm install
node build.mjs            # 输出到 dist/，可加参数指定其他目录
```

## 文件

| 文件 | 作用 |
|---|---|
| `build.mjs` | 渲染 Markdown、改写链接、在章节上方插入幻灯片播放器、复制实验页和幻灯片 |
| `shell.html` | 页面框架：布局、搜索、图表查看器、学习层（进度、笔记、思考题参考答案）。`const DATA = __DATA__;` 一行由构建填入 |
| `site-config.json` | 侧栏分组顺序、实验页标题 |

## 构建做了什么

- 文档：`README.md`、`docs/` 全部章节、`practice/README.md`。文档之间的链接变成站内跳转；指向 `interactive/` 的链接打开站内实验页；指向 `practice/cex-demo/` 的链接指向 GitHub 上的 [CEX-Demo](https://github.com/ocean-8848/CEX-Demo) 仓库。
- 幻灯片播放器：按 `video/README.md` 剧集表的「来源」列，把每集放到对应章节上方。一章对应多集时显示标签切换。
- 实验页：在每个页面末尾加一小段脚本，让页面里的章节链接跳回站内对应章节。

## 发布

`dist/` 的内容整体发布即可。`dist/index.html` 是主页面，其余文件按原路径作为附属文件一起上传。
