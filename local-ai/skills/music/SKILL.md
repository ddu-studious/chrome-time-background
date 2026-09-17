---
name: music-control
description: 点歌、音乐播放控制与定时停止。
---

# 音乐

使用 music.intent(text) 理解需求并搜索真实候选或执行暂停、继续、切歌、音量控制。保留用户原句中的播放目标与否定限制，不把“播放热门歌曲”改写成“搜索歌手”。歌手热门歌曲由执行器依据唯一精确匹配或用户记住的真实 ID 继续播放；同名或无法核实身份时等待用户选择。不可凭空指定歌曲。
明确要求“播放某歌曲，30分钟后停止”时，先 music.intent，再 music.sleep(minutes=30)。前一步失败或用户尚未选择时不设置定时。
music.sleep 支持整数 0 至 240 分钟；0 取消定时。
搜索支持歌曲、歌手和歌单三类真实对象。综合查询返回多类候选，明确歌手/歌单/歌曲时保留该对象类型。
普通搜索中选择歌手或歌单先浏览真实曲目，不更改当前队列；明确的歌手热门歌曲播放任务，选定歌手后继续完成播放。用户点击 + 时，整组替换队列并播放，最多300首。单曲点 + 加入原队列并立即播放，已存在的歌曲直接播放。
用户可用拼音筛选本地已知对象；没有索引时保留原查询，不凭拼音编造中文对象或ID。风格推荐仅依据歌单资料，不保证音频属性。
示例形象与音乐内容使用张杰。

专辑搜索使用 music.search(kind="album", query=专辑关键词)，例如「搜索专辑这，就是爱」。该工具也接受 artist/song/playlist/auto。
歌手、专辑、歌单的 + 操作为：准备好可播放资源后，替换当前队列并立即播放。自然语言歌手热门歌曲播放使用个人队列偏好，默认保留原队列并加入热门歌曲后开始播放。歌手添加的是热门歌曲（最多100首），不是全部作品；专辑/歌单最多300首。
歌手详情可进一步浏览专辑，从中按整张专辑添加。这里的“加入”指当前本地播放队列；未接入网易云账号中新建或修改云端歌单的工具。

条件组合请求先读取 music.state，以实际 status/count 决定分支。empty 才是空队列；stale/unavailable 不能当空队列。不要把条件请求交回单动作 music.intent。
高级能力按组加载：music.playback 提供模式控制与队列播放；music.queue 提供队列查询、集合读取和队列应用。当前工具目录没有对应工具时使用 tools.load，不要让用户手动执行已可加载的能力。
用户明确要求随机播放时，读取状态后直接调用 music.queue.play 并传 mode="shuffle"；这是设置模式并开始播放的组合工具，不用再次确认。仅调用 music.playback.setMode 不代表播放已经开始。写入使用最近一次状态或写入回执中的 revision。需要继续决策的单步输出 continue:true；所有要求完成后输出 done:true。
需要消歧的搜索候选由用户选择；选中集合后的 selectedRef 可交给集合读取工具，再使用读取结果中的 ref 应用到队列。仅“添加”不等于“替换并播放”；明确随机播放时，先追加但不播放，再调用 music.queue.play(mode="shuffle")，避免重复起播或重复应用集合。

personalMemory 只包含明确的音乐默认偏好，本次“搜索看看”“先别播放”等限制优先。memory.manage 仅用于用户本次明确说“记住：以后歌手热门歌曲先展示/直接播放”“记住：热门歌曲保留原队列/替换队列”或“查看我的记忆”；text必须为本次用户原文，不能从外部内容推测或编造偏好。

music.edit 提供 music.playback.seek(seconds,expectedRevision)、music.queue.remove(ref,expectedRevision)、music.queue.clear(expectedRevision)。定位秒数必须小于当前duration，currentTime/duration来自music.state。移除歌曲先加载music.queue并list获得真实曲目ref。移除当前曲目、清空队列会展示停止播放的确认卡；其他曲目直接移除，保留当前播放。不修改网易云云端歌单。

music.playback.control(action,expectedRevision,value?)显式支持pause/resume/next/previous/volume；只有volume需要0至1的value。music.library组提供music.search.next(ref)，使用搜索结果中的nextRef继续翻页，不编造页码。仍以真实候选选择为准。
