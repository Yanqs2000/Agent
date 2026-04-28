# Agent 项目技术报告
A Simple Agent by Vibe Coding

## 1. 项目概览

这是一个基于 ReAct 思路实现的本地代码代理项目。核心程序位于 `agent.py`，它通过命令行接收一个目标项目目录，然后把该目录的文件列表、可用工具和固定系统提示词一起发送给大模型。模型每轮必须输出 `<thought>` 和 `<action>` 或 `<final_answer>`，Python 程序负责解析 `<action>`、执行对应工具，并把执行结果包装成 `<observation>` 继续交给模型，直到模型输出最终答案。

项目内同时包含一个 `snake` 示例目录。该目录是一个浏览器端贪吃蛇小游戏，作为 Agent 可以读取、修改和运行命令操作的目标项目示例。

## 2. 目录结构

```text
.
├── agent.py              # ReAct Agent 主程序、CLI 入口和本地工具函数
├── prompt_template.py    # Agent 系统提示词模板
├── pyproject.toml        # Python 项目元数据和依赖声明
├── uv.lock               # uv 锁文件
├── README.md             # 项目技术报告和运行说明
└── snake/
    ├── index.html        # 贪吃蛇页面结构
    ├── style.css         # 页面样式
    └── game.js           # 贪吃蛇游戏逻辑
```

> 注意：本地还可能存在 `.env`、`.venv`、`__pycache__`、`.DS_Store` 等环境或缓存文件，它们不是业务代码的一部分。

## 3. 运行环境与依赖

项目要求 Python 版本不低于 3.12。依赖由 `pyproject.toml` 声明：

```toml
dependencies = [
    "click>=8.2.1",
    "langchain>=1.2.15",
    "langchain-google-genai>=4.2.2",
    "openai>=1.91.0",
    "python-dotenv>=1.1.1",
]
```

当前代码实际直接使用的第三方库是：

- `click`：构建命令行入口，校验项目目录参数。
- `python-dotenv`：从 `.env` 加载环境变量。
- `openai`：通过 OpenAI 兼容接口调用模型。

`langchain` 和 `langchain-google-genai` 当前未在代码中直接使用，可能是实验遗留依赖或后续扩展预留。

## 4. 运行方法

首先安装 `uv`，可参考官方文档：

```text
https://docs.astral.sh/uv/guides/install-python/
```

然后在当前目录创建 `.env` 文件，并配置 API Key：

```env
OPENROUTER_API_KEY=xxx
```

当前 `agent.py` 中的模型客户端配置如下：

```python
OpenAI(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key=ReActAgent.get_api_key(),
)
```

也就是说，代码使用 OpenAI SDK 访问火山引擎 Ark 的 OpenAI 兼容接口，但环境变量名称仍然叫 `OPENROUTER_API_KEY`。如果使用其他兼容服务，需要同步调整 `base_url`、模型名和环境变量命名。

启动命令：

```bash
uv run agent.py snake
```

启动后程序会提示：

```text
请输入任务：
```

用户输入任务后，Agent 开始进入 ReAct 循环。

## 5. Agent 总体架构

Agent 由四层组成：

- CLI 层：`main()` 负责接收项目目录、创建 Agent、读取用户任务并输出最终答案。
- Agent 编排层：`ReActAgent` 保存工具、模型配置、项目目录和 OpenAI 客户端，并驱动循环。
- Prompt 层：`prompt_template.py` 提供系统提示词模板，`render_system_prompt()` 注入操作系统、工具列表和项目文件列表。
- Tool 层：`read_file()`、`write_to_file()`、`run_terminal_command()` 提供文件读取、文件写入和终端命令执行能力。

## 6. Agent 工作流程

完整流程如下：

1. 用户执行 `uv run agent.py snake`，`click` 校验 `snake` 必须是已存在的目录。
2. `main(project_directory)` 将目录转成绝对路径。
3. `main()` 创建工具列表：`read_file`、`write_to_file`、`run_terminal_command`。
4. `main()` 实例化 `ReActAgent`，并传入工具、模型名和目标项目目录。
5. `ReActAgent.__init__()` 将工具列表转换为 `{工具名: 函数对象}` 的字典，并初始化 OpenAI 客户端。
6. 程序通过 `input("请输入任务：")` 获取用户任务。
7. `agent.run(task)` 创建初始消息：
   - system 消息：由 `render_system_prompt()` 渲染。
   - user 消息：把用户任务包装成 `<question>...</question>`。
8. `run()` 进入 `while True` 循环。
9. 每一轮先调用 `call_model(messages)` 请求模型。
10. 模型返回内容后，程序用正则提取 `<thought>` 并打印。
11. 如果模型输出 `<final_answer>`，程序提取最终答案并返回。
12. 如果没有最终答案，程序必须找到 `<action>`；找不到就抛出 `RuntimeError("模型未输出 <action>")`。
13. `parse_action(action)` 将形如 `tool_name("arg1", "arg2")` 的文本解析为工具名和参数列表。
14. 程序打印将要执行的工具。
15. 如果工具是 `run_terminal_command`，程序会额外询问用户是否继续；其他工具直接执行。
16. 工具执行成功后返回结果；工具抛异常时，异常会被包装为 `工具执行错误：...`。
17. 程序将工具结果包装为 `<observation>...</observation>`，作为新的 user 消息追加到 `messages`。
18. 循环继续，直到模型输出 `<final_answer>`。

这个流程对应典型 ReAct 模式：

```text
Question
  -> Thought
  -> Action
  -> Observation
  -> Thought
  -> Action
  -> Observation
  -> ...
  -> Final Answer
```

## 7. Prompt 机制

`prompt_template.py` 中只有一个变量：`react_system_prompt_template`。

它定义了模型必须遵守的输出协议：

- 每次回答必须包含 `<thought>`。
- `<thought>` 后只能接 `<action>` 或 `<final_answer>`。
- 输出 `<action>` 后必须停止，等待真实工具返回的 `<observation>`。
- 多行工具参数要用 `\n` 表示。
- 工具参数中的文件路径必须使用绝对路径。
- 最终答案中要求模型说明自己是什么模型。

模板中有三个占位符：

- `${tool_list}`：由 `get_tool_list()` 生成，包含工具函数签名和 docstring。
- `${operating_system}`：由 `get_operating_system_name()` 生成。
- `${file_list}`：由 `render_system_prompt()` 生成，只包含目标项目目录第一层文件和目录的绝对路径。

## 8. Python 函数与方法说明

### 8.1 `class ReActAgent`

`ReActAgent` 是核心编排类，负责管理工具、提示词渲染、模型调用、动作解析和工具执行循环。

#### `__init__(self, tools: List[Callable], model: str, project_directory: str)`

构造 Agent 实例。

主要逻辑：

- 将传入的工具函数列表转换为字典：`{func.__name__: func}`，方便后续通过模型输出的工具名查找函数。
- 保存模型名和目标项目目录。
- 初始化 OpenAI 客户端。
- 客户端当前使用 `https://ark.cn-beijing.volces.com/api/v3` 作为 `base_url`。
- API Key 通过 `ReActAgent.get_api_key()` 从环境变量读取。

输入：

- `tools`：可供模型调用的 Python 函数列表。
- `model`：模型名称，例如 `doubao-seed-2-0-code-preview-260215`。
- `project_directory`：Agent 当前要操作的项目目录。

输出：

- 无显式返回值，初始化实例状态。

#### `run(self, user_input: str)`

执行一次用户任务，是 Agent 的主循环。

主要逻辑：

- 构建初始对话消息。
- 调用 `render_system_prompt()` 生成系统提示词。
- 将用户输入包装成 `<question>...</question>`。
- 在无限循环中调用模型。
- 从模型输出中解析 `<thought>` 并打印。
- 如果检测到 `<final_answer>`，提取答案并返回。
- 如果没有最终答案，则解析 `<action>`。
- 调用 `parse_action()` 得到工具名和参数。
- 对 `run_terminal_command` 执行前进行人工确认。
- 执行对应工具函数。
- 将工具返回值包装为 `<observation>`，追加回对话消息。

输入：

- `user_input`：用户输入的自然语言任务。

输出：

- 模型最终答案字符串。

异常：

- 如果模型没有输出 `<action>` 且没有输出 `<final_answer>`，抛出 `RuntimeError`。
- 如果 `<action>` 语法无法解析，`parse_action()` 会抛出 `ValueError`。

#### `get_tool_list(self) -> str`

生成工具说明文本，用于注入系统提示词。

主要逻辑：

- 遍历 `self.tools.values()`。
- 使用 `inspect.signature(func)` 获取函数签名。
- 使用 `inspect.getdoc(func)` 获取函数文档字符串。
- 拼接为列表项格式：`- name(signature): doc`。

输入：

- 无。

输出：

- 多行字符串，每一行描述一个工具。

#### `render_system_prompt(self, system_prompt_template: str) -> str`

渲染系统提示词模板。

主要逻辑：

- 调用 `get_tool_list()` 生成工具清单。
- 使用 `os.listdir(self.project_directory)` 获取目标目录第一层文件名。
- 将每个文件名转换成绝对路径。
- 使用 `Template(...).substitute(...)` 替换模板变量：
  - `operating_system`
  - `tool_list`
  - `file_list`

输入：

- `system_prompt_template`：包含 `${...}` 占位符的模板字符串。

输出：

- 可直接发送给模型的完整 system prompt。

注意：

- `file_list` 只包含第一层，不递归列出子目录内容。
- 如果目标目录特别大，当前实现没有做长度控制。

#### `get_api_key() -> str`

静态方法，从环境变量读取 API Key。

主要逻辑：

- 调用 `load_dotenv()` 加载 `.env`。
- 读取 `OPENROUTER_API_KEY`。
- 如果变量不存在，抛出 `ValueError`。

输入：

- 无。

输出：

- API Key 字符串。

异常：

- 未找到 `OPENROUTER_API_KEY` 时抛出 `ValueError("未找到 OPENROUTER_API_KEY 环境变量，请在 .env 文件中设置。")`。

#### `call_model(self, messages)`

调用模型接口。

主要逻辑：

- 打印等待提示。
- 调用 `self.client.chat.completions.create(...)`。
- 使用 `self.model` 作为模型名。
- 将当前 `messages` 作为上下文发送给模型。
- 提取 `response.choices[0].message.content`。
- 将模型返回内容追加到 `messages`，角色为 `assistant`。
- 返回模型文本内容。

输入：

- `messages`：OpenAI Chat Completions 格式的消息列表。

输出：

- 模型返回的文本内容。

注意：

- 当前没有设置 `temperature`、`max_tokens`、超时、重试或流式输出。
- `messages` 会在函数内部被原地修改。

#### `parse_action(self, code_str: str) -> Tuple[str, List[str]]`

解析模型输出的工具调用文本。

主要逻辑：

- 使用正则 `(\w+)\((.*)\)` 匹配函数调用形式。
- 提取函数名和括号内参数字符串。
- 手动扫描参数字符串。
- 识别单引号、双引号字符串。
- 识别圆括号嵌套深度，避免把嵌套圆括号中的逗号误判为参数分隔符。
- 在顶层逗号处分割参数。
- 每个参数交给 `_parse_single_arg()` 转换为 Python 值。

输入：

- `code_str`：例如 `read_file("/tmp/a.txt")`。

输出：

- `(func_name, args)` 元组。
- `func_name` 是工具名字符串。
- `args` 是位置参数列表。

异常：

- 如果字符串不是 `函数名(...)` 形式，抛出 `ValueError("Invalid function call syntax")`。

限制：

- 不支持真正的关键字参数调用，例如 `read_file(file_path="/tmp/a.txt")` 会被解析成一个普通字符串参数。
- 只跟踪圆括号深度，不跟踪列表 `[]` 或字典 `{}` 的嵌套深度。
- 不校验工具名是否存在，工具名不存在时会在 `self.tools[tool_name]` 处触发异常。

#### `_parse_single_arg(self, arg_str: str)`

解析单个工具参数。

主要逻辑：

- 去除参数首尾空白。
- 如果参数是单引号或双引号包裹的字符串，去掉外层引号。
- 手动处理常见转义：
  - `\"`
  - `\'`
  - `\n`
  - `\t`
  - `\r`
  - `\\`
- 如果不是字符串字面量，则尝试用 `ast.literal_eval()` 解析为 Python 字面量。
- 如果解析失败，返回原始字符串。

输入：

- `arg_str`：单个参数文本。

输出：

- Python 值，可能是字符串、数字、列表、字典、布尔值等；解析失败时返回原始字符串。

#### `get_operating_system_name(self)`

返回当前操作系统的人类可读名称。

主要逻辑：

- 使用 `platform.system()` 获取系统标识。
- 将 `Darwin` 映射为 `macOS`。
- 将 `Windows` 映射为 `Windows`。
- 将 `Linux` 映射为 `Linux`。
- 其他值返回 `Unknown`。

输入：

- 无。

输出：

- 操作系统名称字符串。

### 8.2 工具函数

这些函数会被加入 Agent 工具列表，模型可以通过 `<action>` 调用它们。

#### `read_file(file_path)`

读取文本文件内容。

主要逻辑：

- 使用 UTF-8 编码打开指定文件。
- 返回完整文件内容。

输入：

- `file_path`：文件路径，系统提示词要求模型必须传绝对路径。

输出：

- 文件内容字符串。

异常：

- 文件不存在、权限不足或编码不兼容时会抛异常；`run()` 会捕获并包装为 observation。

#### `write_to_file(file_path, content)`

将内容写入文件。

主要逻辑：

- 使用 UTF-8 编码以写模式打开目标文件。
- 写入前将字符串中的字面量 `\n` 替换为真实换行。
- 返回 `写入成功`。

输入：

- `file_path`：目标文件路径。
- `content`：要写入的文本内容。

输出：

- 固定字符串 `写入成功`。

注意：

- 使用 `"w"` 模式会覆盖已有文件。
- 当前没有备份、diff 或权限校验。

#### `run_terminal_command(command)`

执行终端命令。

主要逻辑：

- 在函数内部导入 `subprocess`。
- 调用 `subprocess.run(command, shell=True, capture_output=True, text=True)`。
- 如果返回码为 0，返回 `执行成功`。
- 如果返回码非 0，返回 `stderr`。

输入：

- `command`：Shell 命令字符串。

输出：

- 成功时返回固定字符串 `执行成功`。
- 失败时返回标准错误内容。

安全设计：

- `run()` 中对该工具做了额外人工确认，只有用户输入 `y` 才会执行。

限制：

- 成功时不返回标准输出，模型无法直接看到命令输出。
- 使用 `shell=True`，如果模型生成危险命令会有安全风险。
- 当前没有命令超时控制。

### 8.3 CLI 函数

#### `main(project_directory)`

命令行入口函数。

主要逻辑：

- 由 `@click.command()` 声明为 CLI 命令。
- 由 `@click.argument(...)` 声明唯一参数 `project_directory`。
- 参数要求：
  - 路径必须存在。
  - 必须是目录。
  - 不能是文件。
- 将目录转为绝对路径。
- 创建工具列表。
- 创建 `ReActAgent` 实例。
- 通过 `input()` 读取用户任务。
- 调用 `agent.run(task)`。
- 打印最终答案。

输入：

- `project_directory`：命令行传入的目标项目目录。

输出：

- 无显式返回值；最终答案打印到终端。

#### `if __name__ == "__main__": main()`

Python 脚本入口判断。

主要逻辑：

- 当用户直接运行 `agent.py` 时调用 `main()`。
- 当该文件被其他模块 import 时，不自动启动 CLI。

## 9. `snake` 示例项目说明

`snake` 是一个纯前端贪吃蛇小游戏，由 HTML、CSS 和 JavaScript 组成，不依赖构建工具。

### 9.1 `snake/index.html`

页面结构包含：

- `<canvas id="gameCanvas" width="400" height="400"></canvas>`：游戏画布。
- `<span id="score">0</span>`：分数显示。
- `<button id="startBtn">开始游戏</button>`：开始按钮。
- `<button id="pauseBtn">暂停</button>`：暂停/继续按钮。
- `<script src="game.js"></script>`：加载游戏逻辑。

### 9.2 `snake/style.css`

样式文件负责：

- 重置默认 margin、padding，并启用 `box-sizing: border-box`。
- 将页面居中显示。
- 给页面背景设置渐变。
- 给 `.container` 设置白色面板、圆角和阴影。
- 设置画布边框、按钮样式、hover 状态和说明文字样式。

### 9.3 `snake/game.js` 全局状态

`game.js` 使用全局变量维护游戏状态：

- `canvas`：游戏画布 DOM 节点。
- `ctx`：Canvas 2D 绘图上下文。
- `scoreElement`：分数 DOM 节点。
- `startBtn`：开始按钮 DOM 节点。
- `pauseBtn`：暂停按钮 DOM 节点。
- `gridSize`：每个格子的像素大小，当前为 20。
- `tileCount`：横向和纵向格子数量，由 `canvas.width / gridSize` 得到，当前为 20。
- `snake`：蛇身数组，每个元素是 `{x, y}` 坐标。
- `food`：食物坐标对象。
- `dx`、`dy`：蛇每一步在 x/y 方向上的移动增量。
- `score`：当前得分。
- `gameRunning`：游戏是否正在运行。
- `gamePaused`：游戏是否暂停。
- `gameLoop`：`setInterval()` 返回的定时器 ID。

## 10. JavaScript 函数说明

#### `randomFoodPosition()`

随机生成食物位置。

主要逻辑：

- 随机生成 `x` 和 `y` 坐标，范围是 `0` 到 `tileCount - 1`。
- 遍历蛇身，检查食物是否落在蛇身上。
- 如果食物和任意蛇身片段重合，则递归调用自身重新生成。

输入：

- 无。

输出：

- 无显式返回值；通过修改全局变量 `food` 更新食物坐标。

注意：

- 当蛇占满画布时，递归可能无法结束。

#### `drawGame()`

绘制当前游戏画面。

主要逻辑：

- 用浅灰色填充整个画布，相当于清屏。
- 设置绿色填充样式，遍历 `snake` 绘制每一节蛇身。
- 设置橙红色填充样式，根据 `food` 坐标绘制食物。
- 每个格子绘制时使用 `gridSize - 2`，让格子之间保留 2 像素间隙。

输入：

- 无。

输出：

- 无显式返回值；副作用是更新 Canvas 画面。

#### `moveSnake()`

推进蛇移动一步，并处理碰撞和吃食物逻辑。

主要逻辑：

- 如果 `dx === 0 && dy === 0`，说明玩家还没有选择方向，函数直接返回。
- 根据蛇头和方向增量计算新蛇头。
- 检查是否撞墙。
- 检查是否撞到自身。
- 将新蛇头加入 `snake` 数组头部。
- 如果新蛇头位置等于食物位置：
  - 分数增加 10。
  - 更新页面分数。
  - 调用 `randomFoodPosition()` 生成新食物。
- 如果没有吃到食物：
  - 移除蛇尾，保持长度不变。

输入：

- 无。

输出：

- 无显式返回值；通过修改全局状态更新游戏。

#### `gameOver()`

结束游戏。

主要逻辑：

- 将 `gameRunning` 设为 `false`。
- 调用 `clearInterval(gameLoop)` 停止游戏循环。
- 使用 `alert()` 弹出最终得分。

输入：

- 无。

输出：

- 无显式返回值。

#### `startGame()`

开始一局新游戏。

主要逻辑：

- 如果游戏已经运行，直接返回，避免重复启动多个定时器。
- 重置蛇的位置为 `{x: 10, y: 10}`。
- 重置方向、分数和页面分数显示。
- 设置 `gameRunning = true`。
- 设置 `gamePaused = false`。
- 调用 `randomFoodPosition()` 生成食物。
- 使用 `setInterval()` 每 100ms 执行一次游戏循环。
- 每轮循环中，如果未暂停，则调用 `moveSnake()` 和 `drawGame()`。

输入：

- 无。

输出：

- 无显式返回值；副作用是初始化游戏状态并启动定时器。

#### `togglePause()`

切换暂停状态。

主要逻辑：

- 如果游戏未运行，直接返回。
- 反转 `gamePaused`。
- 根据暂停状态更新按钮文字：
  - 暂停时显示 `继续`。
  - 运行时显示 `暂停`。

输入：

- 无。

输出：

- 无显式返回值。

#### `document.addEventListener('keydown', (e) => { ... })`

键盘控制事件处理函数。

主要逻辑：

- 如果游戏未运行或已暂停，直接返回。
- 根据方向键更新移动方向：
  - `ArrowUp`：向上移动。
  - `ArrowDown`：向下移动。
  - `ArrowLeft`：向左移动。
  - `ArrowRight`：向右移动。
- 每个方向都有反向移动保护：
  - 向上时不允许从向下直接反转。
  - 向下时不允许从向上直接反转。
  - 向左时不允许从向右直接反转。
  - 向右时不允许从向左直接反转。

输入：

- `e`：键盘事件对象。

输出：

- 无显式返回值；通过修改 `dx`、`dy` 改变运动方向。

#### `startBtn.addEventListener('click', startGame)`

开始按钮事件绑定。

主要逻辑：

- 用户点击开始按钮时调用 `startGame()`。

#### `pauseBtn.addEventListener('click', togglePause)`

暂停按钮事件绑定。

主要逻辑：

- 用户点击暂停按钮时调用 `togglePause()`。

#### `setInterval(() => { ... }, 100)` 中的匿名函数

游戏循环回调函数。

主要逻辑：

- 每 100ms 被浏览器调用一次。
- 如果 `gamePaused` 为 `false`：
  - 调用 `moveSnake()` 更新游戏状态。
  - 调用 `drawGame()` 重绘画面。

该函数定义在 `startGame()` 内部，只在游戏启动后创建。

## 11. 数据流与控制流

### 11.1 Agent 数据流

```text
用户任务
  -> main()
  -> ReActAgent.run()
  -> render_system_prompt()
  -> call_model()
  -> 模型输出 XML 标签
  -> parse_action()
  -> 工具函数
  -> observation
  -> messages
  -> call_model()
  -> final_answer
```

### 11.2 Agent 工具调用流

```text
<action>read_file("/abs/path/file")</action>
  -> parse_action()
  -> tool_name = "read_file"
  -> args = ["/abs/path/file"]
  -> self.tools["read_file"](*args)
  -> <observation>文件内容</observation>
```

### 11.3 贪吃蛇游戏流

```text
页面加载
  -> 获取 DOM 和 Canvas 上下文
  -> 初始化全局状态
  -> 绑定键盘和按钮事件
  -> drawGame()
  -> randomFoodPosition()

点击开始
  -> startGame()
  -> 重置状态
  -> randomFoodPosition()
  -> setInterval 游戏循环

游戏循环
  -> moveSnake()
  -> drawGame()

方向键
  -> 更新 dx/dy

撞墙或撞自己
  -> gameOver()
  -> clearInterval()
  -> alert()
```

## 12. 错误处理与安全边界

当前错误处理主要集中在 Agent 工具执行阶段：

- 工具函数抛出的异常会在 `run()` 中被捕获，并包装成 `工具执行错误：...` 作为 observation 返回给模型。
- 模型没有输出 `<action>` 且没有输出 `<final_answer>` 时，程序会直接抛出运行时错误。
- 终端命令执行前有人工确认，降低误执行风险。

仍然需要注意的风险：

- `write_to_file()` 会覆盖文件，没有备份。
- `run_terminal_command()` 使用 `shell=True`，且无超时控制。
- `run_terminal_command()` 成功时不返回 stdout，降低了模型基于命令输出继续推理的能力。
- `parse_action()` 不是完整 Python 解析器，对复杂参数支持有限。
- 系统提示词示例包含关键字参数形式，但当前 `parse_action()` 只可靠支持位置参数。
- `render_system_prompt()` 只列目标目录第一层文件，模型需要进一步调用 `read_file()` 才能看到文件内容。
- API Key 环境变量名和实际 `base_url` 语义不一致，容易造成配置困惑。

## 13. 可改进方向

- 将 API Key 环境变量改成和服务商一致的名称，例如 `ARK_API_KEY`，或把 `base_url` 和 `model` 都改为可配置项。
- 用 `ast.parse()` 或结构化 JSON action 替代手写 `parse_action()`，增强关键字参数、列表、字典和转义字符支持。
- 让 `run_terminal_command()` 返回 stdout、stderr 和 return code，便于模型继续判断。
- 给终端命令增加超时、命令白名单或更细粒度的用户确认。
- 给 `write_to_file()` 增加写入前 diff 展示或备份机制。
- 在 `render_system_prompt()` 中递归列出项目文件，但需要加入长度限制和忽略规则。
- 给 Agent 增加日志级别，避免模型长输出时终端信息过多。
- 给 `snake` 增加移动端触摸控制和游戏重开按钮状态管理。
- 修复 `snake/game.js` 初始调用顺序：当前文件末尾先 `drawGame()` 后 `randomFoodPosition()`，首次绘制时 `food` 还没有有效坐标。

## 14. 总结

该项目的核心是一个最小可运行的 ReAct Agent。它没有复杂框架，主要依靠 prompt 约束模型输出格式，再由 Python 程序解析 action 并执行本地工具。整体结构清晰，适合用于学习 Agent 的基本循环、工具调用和 observation 反馈机制。

当前实现的主要价值在于简单直接，主要短板在于 action 解析、终端命令安全、文件写入保护和模型配置可维护性。如果要继续扩展为更可靠的代码助手，优先应改进工具调用协议、命令执行结果返回、配置管理和文件修改前的安全确认。
