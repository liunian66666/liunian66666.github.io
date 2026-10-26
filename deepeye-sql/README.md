# DeepEye-SQL 静态案例预览

此目录发布在 GitHub Pages，沿用 DeepEye-SQL 原演示页的 HTML/CSS 布局。
`cases.json` 由 `build_cases.py` 从本地三次成功运行的 `result.json` 与
`sql_selection.snapshot` 提取，题目与 SQL 同 `evals/demo-fast/questions.json`
逐条核对。导出字段仅包含问题、证据、阶段耗时、三版 SQL、Schema、用量和只读结果；
本机路径、密钥与原始运行产物不进入公开页面。

页面明确标注为 2026-10-26 的历史实测回放。播放按钮只是加速浏览七个已保存阶段，
不会调用模型或执行新 SQL。三题评测来源见
[快速演示报告](https://github.com/liunian66666/text2Sql/blob/master/evals/demo-fast/report.md)。

更新记录时，在已安装项目依赖的 Python 环境中运行：

```text
python deepeye-sql/build_cases.py <DeepEye-SQL 本地目录>
```
