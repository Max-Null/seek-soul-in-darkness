# v0.1.5 预设技能包 + 预设插件更新

## 新增

- **预设技能包（14 技能出厂）**：8 mxy + 6 omo 随安装包内置，首次启动
  非覆盖合并到用户 `~/.dsh/skills`（用户已有同名技能则保留用户的，不覆盖）；
  技能内容变化会纳入运行时指纹，触发老用户自动升级部署。
- **画卷式消息导航（dsh-chat-rail）**：会话右侧 rail——scroll-spy 高亮居中、
  编号/时间/完整预览、与 better-sidebar 双面板动画同步避让。
- **节点外观（dsh-node-appearance 0.1.1）**：按节点类型/工具名配色的可配置
  配色 + 思考过程显示开关，随预设开箱即用。
- **会话完成通知**：回合完成且窗口失焦（最小化/遮挡）时弹 Windows 通知
  「会话已完成，用时 mm:ss」+ 系统提示音。
- **通知体系扩展**：卡点通知（授权/提问事件）+ SSiD 面板「通知」tab
  （总开关/会话完成/提问/授权，壳层实时读取）+ 设置页「关于 SSiD」通知卡。
- **记忆面板刷新**：dsh-memory 0.2.x 关域重开重读文件 + 面板刷新按钮；
  0.2.2 根治 reload 重复注册 backend 致刷新变空。

## 更新

- dsh-better-sidebar 0.13.1
- dsh-memory 0.2.2
- dsh-skin 改 registry 版 ^0.4.1（移除 vendored 拷贝）
- dsh-skill-mcp-center 0.1.0 预制
- dsh-ssid-panels 0.1.2（通知 tab）
- dsh-plugin-center 0.1.5（更新假成功修复）

## 修复

- 部署后 pnpm 元数据校正——归档携带构建机 store/virtualStore 绝对路径，
  不改写则应用内插件更新报 UNEXPECTED_STORE/_VIRTUAL_STORE。
- 运行时指纹覆盖 vendor/skills 目录清单——插件/技能更新不再被跳过重部署。

## 更新说明

- v0.1.4 用户覆盖安装本版即可；首启版本检测正常触发重部署（约 30 秒，可取消）。
- 出厂技能为「合并不覆盖」语义：已有同名技能保持用户版本，新技能自动补入。
