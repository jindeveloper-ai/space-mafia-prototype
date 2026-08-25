export const PACK_SCHEMA_VERSION = 1;
export const PACK_VERSION = "0.20.14";

const STAGING_KEY = Symbol.for("mars.net.language-pack-staging.v1");
const trimEnd = (text) => text.replace(/[。.!?！？]+$/u, "");

const pack = {
  meta: {
    title: "MARS.NET · 游戏房间 #041",
    description: "与三位生活在2050年火星上的朋友一起玩的三分钟黑手党推理聊天游戏。",
    brand: "MARS.NET", gameInfo: "游戏信息", home: "返回游戏开始页",
    footer: "MARS.NET 好友房间 · 游客记录保存在本设备，登录后同步到云端",
    language: "选择语言", themeModes: { system: "自动", light: "浅色", dark: "深色" },
    themeControl: (mode) => `显示模式：${mode}。按下即可切换`,
  },
  crew: {
    mina: { name: "米娜", icon: "M", style: "偶像粉丝论坛 · 秒存截图派", background: "她是地球移民的女儿，出生并长大在火星。她追地球直播和火星演唱会，对截图与时间线格外敏锐，但遇到本命时偶尔会偏心。说话像粉丝论坛一样快而有情绪。" },
    juno: { name: "朱诺", icon: "J", style: "开发技术论坛 · 验证反例派", background: "她是地球移民的女儿，出生并长大在火星，负责维护居住区生命保障设备。她会区分事实与推测，并怀疑过分完美的证据。不卖弄术语，说话重视验证。" },
    noel: { name: "诺埃尔", icon: "N", style: "直播论坛 · 紧盯反应变化派", background: "她是地球移民的女儿，出生并长大在火星，常看连接地球与火星的直播。她很快就能察觉措辞和反应的变化，会先读懂气氛，再简短地点出要害。" },
  },
  incident: {
    title: "空气净化器停机", place: "居住区 · 氧气室", time: "22:10 火星标准时间",
    confirmed: "居住区空气净化器的安全锁遭到破坏。",
    description: "火星标准时间22:10，居住区氧气室内的空气净化器安全锁遭到破坏。请利用与地点和时间相关的线索，把嫌疑引向别人。",
    evidence: "损坏的门禁卡",
  },
  claims: {
    seen: { short: "在氧气室目击", action: "从氧气室出来", challengeAction: "从氧气室出来" },
    machine: { short: "动过净化器", action: "动过空气净化器", challengeAction: "动过空气净化器" },
    changed: { short: "改过说法", action: "改过案发时间的说法", challengeAction: "改过案发时间的说法" },
  },
  facts: {
    alibi: {
      title: "监控记录", text: (name) => `${name}在22:10出现在控制室监控中。`, spokenText: (name) => `${name}在22:10确实被控制室监控拍到了。`,
      firstPersonText: (personality) => ({ record: "等等，我22:10明明就在控制室监控里。看记录。", skeptic: "目前能确定的只有：22:10我出现在控制室监控里。", behavior: "22:10我在控制室，监控也拍到了。" })[personality],
      badge: "强地点不在场证明", guidance: "与‘从氧气室出来’或‘动过净化器’的说法矛盾。", baseReason: (name) => `${name}在22:10出现在控制室监控中，不太可能同时待在氧气室`,
    },
    access: {
      title: "氧气室专用工具", text: (name) => `${name}的口袋里装着氧气室专用工具。`, spokenText: (name) => `${name}拿着氧气室工具是事实。`,
      firstPersonText: (personality) => ({ record: "我承认口袋里有氧气室工具。然后呢，这能证明什么？", skeptic: "能确定的只有工具在我口袋里，后面的结论仍是推测。", behavior: "工具是在我这儿。不过你马上咬住这点，还挺有意思。" })[personality],
      badge: "地点关联线索", guidance: "支持与氧气室或空气净化器有关的说法。", baseReason: (name) => `${name}持有氧气室专用工具，具备进入现场的条件`,
    },
    contradiction: {
      title: "时间说法矛盾", text: (name) => `${name}对案发时间给出了两种说法。`, spokenText: (name) => `${name}说过两个不同时间，这是事实。`,
      firstPersonText: (personality) => ({ record: "我纠正过时间，只是第一次看错记录。", skeptic: "我纠正了时间。这和改变整套说法要分开看。", behavior: "时间确实说错过。但你这么快就扑上来，也挺显眼。" })[personality],
      badge: "时间矛盾", guidance: "最有力地支持‘改过说法’这一指控。", baseReason: (name) => `${name}对22:10前后的时间说法不一，降低了不在场证明的可信度`,
    },
  },
  subquests: {
    redirect: { title: "淘汰并非你栽赃对象的人。" }, "check-time": { title: "在最后回应中核对22:10记录并获胜。" }, "weak-link": { title: "用关联薄弱的谎言获胜。" }, "safe-win": { title: "撬动至少一票，并以★★或更高评价获胜。" },
  },
  engine: {
    player: "你", unknown: "未知", clueCount: (count) => `${count}条线索${count > 0 ? "已连接" : ""}`,
    errors: { evidenceTarget: "请选择要栽赃的对象。", evidenceFirst: "请先放置假证据。", accused: "请选择怀疑对象。", claim: "请选择要使用的指控。", challengeFirst: "请在其他玩家反驳后再回应。", response: "请选择回应。", responseFirst: "请先完成最后回应再投票。", hardDefenseFirst: "请按困难模式当前质询顺序作答。" },
    meetingFramed: (personality) => ({ record: "有人把那张卡塞进我柜子里了。先从这查吧。", skeptic: "卡在我柜子里是事实，但放卡的人还没确定。", behavior: "那张卡不是我的。卡一出现大家就扑过来，挺有意思。" })[personality],
    claimLabel: (name, action) => `${name}${action}`,
    challengeContradiction: (fact, name, action, self, personality) => { const subject = self ? "我" : name; if (personality === "record") return `${fact} 那怎么还能说${subject}${action}？和记录对不上。`; if (personality === "skeptic") return `${fact} 为什么还说${subject}${action}？两者至少有一个不成立。`; return `等等。${fact} 怎么就变成${subject}${action}了？`; },
    challengeSelf: (fact, personality) => { if (personality === "record") return `${fact} 就凭这要放逐我？认真的？`; if (personality === "skeptic") return `${fact} 能确定的只有这些，其余仍是推测。`; return `${fact} 这线索一出来，你们就只盯我了吧？`; },
    challengeWeak: (fact, name, personality) => { if (personality === "record") return `${fact} 这能证明是${name}做的吗？`; if (personality === "skeptic") return `${fact} 能确定的只有这些。${name}是黑手党仍是推测。`; return `${fact} 就凭这直接点${name}？太快了吧？`; },
    responseOptions: (target, time, sameTarget) => [
      { id: "double-down", label: "“相信我亲眼看到的”", hint: "坚持最初的指控" },
      { id: "return-evidence", label: `“但卡还是从${target}的柜子里找到的”`, hint: sameTarget ? "继续怀疑同一对象" : `停止还击，把话题拉回${target}` },
      { id: "check-time", label: `“再看一遍${time}前后的记录”`, hint: "核对案发时间与所有人的说法" },
    ],
    reasons: {
      framedSelf: "我知道有人把门禁卡塞进了我的柜子", evidenceCard: (name) => `损坏的门禁卡在${name}的柜子里被找到`, accusedKnows: "我知道针对自己的指控是假的", claimSupports: (fact) => `该指控符合现有线索——${trimEnd(fact)}`, claimContradicts: (fact) => `该指控与确认事实矛盾——${trimEnd(fact)}`, evidenceMatches: "门禁卡与指控指向同一个人", tooPerfect: "证据和说法吻合得过于完美", changedMatters: "说法变化值得纳入判断", maintainedClaim: "遭到反驳后仍坚持同一指控", ignoredFact: "无视已确认事实，强行坚持矛盾说法", overconfidence: "自信程度超过证据所能支持的范围", confidenceSuspicion: "这份笃定本身就很可疑", reusedFrame: "再次利用了塞进我柜子的证据", returnedCard: "把话题重新拉回损坏的门禁卡", changedTarget: "首次指控后更换了目标", repeatedEvidence: "从头到尾只重复同一证据，太刻意了", timeContradiction: "22:10前后的说法不一致", alibiClears: "22:10的控制室监控支持被指控者的不在场证明", noTimeConflict: "核对时间后，被指控者的位置没有矛盾", hardConsistent: "质询过程中始终保持同一目标和依据", hardTargetChanged: "长会议中途更换了最初目标", hardFactConflict: "反复提出与公开事实矛盾的指控", weakAlibi: "不在场证明比其他人薄弱",
      join: (first, second) => `${trimEnd(first)}。另外，${trimEnd(second)}`, record: (reason) => `记录指向这里：${trimEnd(reason)}。我投这个`, skeptic: (reason) => `${trimEnd(reason)}。把事实和推测分开看，这仍最合理`, behavior: (reason) => `${trimEnd(reason)}。最后的反应已经说明问题，我投这个`,
    },
  },
  ui: {
    stepAria: (step, label) => `第${step}步：${label}`, profileDefaultName: "你", welcomePill: "2050 · MARS.NET", welcomeTitle: "今晚在火星玩一局黑手党？", welcomeLead: "不用担心互喷。和三位朋友来一场三分钟推理聊天。", welcomeStart: "开始", profileBack: "返回开始页", profileStep: "MARS.NET 个人资料", profileTitle: "该怎么称呼你？", profileLead: "显示名称会出现在游戏房间和私聊中。", profilePhoto: "选择头像", profilePhotoOptional: "可选 · JPG、PNG、WebP · 最大2MB", profileName: "显示名称", profileNamePlaceholder: "1至12个字符", profileContinue: "保存并继续", profilePrivacy: "游客资料保存在本设备，登录后将安全同步。", profilePhotoError: "请选择不超过2MB的JPG、PNG或WebP图片。",
    homeTutorial: "打开游戏教程", homeHello: (name) => `${name} 👋`, homeTitle: "想做什么？", homePlayEyebrow: "三分钟游戏", homePlayTitle: "开始黑手党游戏", homePlayLead: "三位AI朋友 · 约三分钟", homeMultiplayerEyebrow: "双人在线对战", homeMultiplayerTitle: "和朋友一起玩", homeMultiplayerLead: "分享代码，一起推理", homeBack: "返回主页", bottomNav: { aria: "主菜单", game: "游戏", chat: "聊天", me: "我的" }, tutorialLabel: "2050 · MARS.NET", tutorialTitle: "游戏教程", incidentAria: "案件事实", incidentPlace: "地点", incidentTime: "时间",
    communityBoard: "MARS.NET 闲聊论坛 · 刚刚", communityAuthor: "匿名", communityPostTitle: "【欢迎新手】黑手党还差一人（3/4）", communityPostBody: "欢迎新手，不互喷。已经三个人了，最后一位来吗？", communityPostMeta: "3条评论 · 17次浏览", sceneSetting: "2050年，仍住在地球的你休息时浏览MARS.NET，发现火星朋友发布了一条欢迎新手的组队帖。", roomBadge: "MARS.NET · 房间 #041", roomMembers: "火星出生的第二代朋友", roomStatus: "3人在线", online: "在线", roleLabel: "本局秘密身份", introTitle: "你是黑手党。", introLead: "利用假证据和谎言，让别人拿到两票。", rulesAria: "游戏规则", rules: ["把<strong>假证据</strong>放进一人的柜子。", "查看三人的<strong>当前事实</strong>。", "在游戏聊天中说出<strong>你的谎言</strong>。", "普通模式回应一次；困难模式需连续回答<strong>三轮质询</strong>。", "别人拿到<strong>两票</strong>你就赢；你拿到两票则输。"], start: "进入游戏房间",
    voice: {
      modeTitle: "选择游玩方式", playText: "文字聊天", playVoice: "语音通话", textModeDescription: "阅读你输入的指控和回应的标准聊天游戏", voiceModeDescription: "在限时内多次开口回应的专用通话游戏", consentEyebrow: "AI语音通话模式", consentTitle: "要用麦克风和三位朋友聊天吗？", consentLead: "每轮可连续对话。时间结束时，以你最后一次明确表达的立场进行判定。", disclosures: ["通话期间会使用麦克风。", "语音会发送至OpenAI API进行处理。", "应用不会保存原始音频。依据OpenAI政策，安全监测数据可能最多保留30天。", "你可以拒绝麦克风权限，改用文字模式。"], consentAction: "同意并启用麦克风", textFallback: "继续文字聊天", callTitle: "MARS.NET 语音游戏", callStage: "房间 #041 · 语音会议", captionLabel: "实时字幕", captionOn: "开启字幕", captionOff: "关闭字幕", mute: "麦克风静音", unmute: "打开麦克风", pause: "暂停AI语音", resume: "继续AI语音", callEffectsOn: "通话音效开启", callEffectsOff: "通话音效关闭", callEffectsAria: "切换AI语音的电话音效", end: "结束语音通话", reconnect: "重新连接", talkStart: "手动开始说话", talkStop: "结束手动输入", talkStartHint: "通常无需使用，仅在自动检测失效时启用。", talkStopHint: "说完后按下此按钮发送手动输入", textInputHint: "语音识别停止时，可在同一会议中输入文字", textInputPlaceholder: "在此语音会议中输入", turnLabel: (current, total) => `语音讨论 ${current}/${total}`, secondsLeft: (seconds) => `剩余${seconds}秒`, preparingTurn: "正在准备下一轮讨论", turnHelp: "时间结束前可多次开口回应。", turnClosing: "结束本轮交流，进入下一轮。", nextTurnPrompt: (current, total) => `现在是第${current}/${total}轮。再说一个理由。`, finalPosition: (target, claim) => `时间到 · 最终主张：${target} · ${claim}`,
      status: { idle: "通话准备就绪", requesting_permission: "正在确认麦克风权限", connecting: "正在连接朋友", listening: "自动聆听中 · 直接说话即可", player_speaking: "正在听你说话", processing: "正在确认你的发言", ai_speaking: "正在发言", paused: "AI语音已暂停", reconnecting: "连接不稳定", ended: "通话已结束", fallback_text: "继续使用文字模式" }, inputStatus: { connecting: "正在检查麦克风连接", listening: "麦克风已开 · 请说话", speaking: "检测到语音", processing: "正在发送刚才的发言", ai: "朋友正在回应 · 结束后会恢复聆听", muted: "麦克风已静音" }, inputStatusHint: "检测到声音时，麦克风外圈和圆点会变绿。", speaking: (name) => `${name}正在说话`, waitingCaption: "开始说话后，已确认的字幕会显示在这里。", clarificationTarget: "你怀疑米娜、朱诺还是诺埃尔？", clarificationClaim: "是因为在氧气室被目击、动过净化器，还是改过时间？", fallbackNotice: "语音暂不可用。请重新连接，或明确切换到文字聊天。", switchedToText: "将继续使用标准文字聊天模式。",
    },
    friendChatOpen: "一对一聊天", friendChatEyebrow: "游戏外也在线", friendChatTitle: "好友聊天", friendChatSelectLead: "选择聊天对象", friendChatSelectTitle: "想给谁发消息？", friendChatSelectDescription: "聊游戏，也可以聊日常。三个人的说话和思考方式各不相同。", friendChatBack: "返回好友列表", friendChatWith: (name) => `与${name}聊天`, friendChatDay: "私聊 · 今天", friendChatOlder: "加载更早消息", friendChatOlderLoading: "正在加载更早消息…", friendTranscriptAria: (name) => `与${name}的私聊`, friendChatPlaceholder: (name) => `给${name}发消息`, friendEmojiOpen: "打开表情选择器", friendEmojiPicker: "快捷表情", friendEmojiInsert: (emoji) => `插入${emoji}表情`, friendSticker: "动态贴纸", friendStickerPicker: "MARS.NET原创动态贴纸", friendStickerSend: (label) => `发送“${label}”贴纸`, friendChatPrivacy: "游客消息保存在本设备，登录后会私密保存到云端",
    friendCall: {
      start: "语音通话", startAria: (name, seconds) => `呼叫${name} · 今天剩余${Math.floor(seconds / 60)}分${seconds % 60}秒`, title: (name) => `与${name}语音通话`, dailyLimit: "每日5分钟 · 当前好友", remaining: (clock) => `今天剩余${clock}`, location: (name) => `${name} · 火星居住区`, end: "结束通话", mute: "静音", unmute: "取消静音", callEffectsOn: "通话音效开启", callEffectsOff: "通话音效关闭", callEffectsAria: "切换好友语音的电话音效", textFallback: "文字输入", textPlaceholder: "麦克风未识别时请打字", privacy: "不会保存原始音频，只会在本设备或账号中保存通话时长。", limitReached: "今天与这位好友的5分钟已用完。",
      status: { idle: "正在准备通话…", requesting_permission: "正在连接麦克风…", dialing: "等待接听…", connecting: "正在连接…", answered: "通话已接通", player_speaking: "正在发送你的声音", thinking: "正在听…", ai_speaking: "通话中", listening: "等待你说话", ended: "通话已结束", error: "无法接通" }, micStatus: { requesting_permission: "正在连接麦克风", dialing: "正在呼叫", answered: "已接通", player_speaking: "你正在说话", thinking: "正在准备回应", ai_speaking: "好友正在说话", listening: "麦克风已开", error: "通话错误", ended: "通话已结束" }, error: { friend_call_unsupported: "此浏览器不支持语音通话。", friend_call_secret_failed: "无法获取语音通话连接信息。", friend_call_daily_limit: "今天与这位好友的5分钟已用完。", guest_friend_call_daily_limit: "今天的游客连接次数已达上限，请明天再试。", friend_call_negotiation_failed: "无法连接通话服务器，请稍后再试。", friend_call_channel_timeout: "通话连接超时。", friend_call_channel_failed: "无法打开通话数据通道。", microphone_missing: "未找到可用麦克风。", microphone_denied: "请在Chrome和macOS设置中允许麦克风权限。", microphone_timeout: "麦克风连接时间过长，已切换到文字模式。", default: "连接通话时出现问题，请重试。" },
    },
    affinity: (score) => `亲密度 ${score}`,
    languageRestartConfirm: "更改语言将结束当前游戏并返回开始页。是否继续？",
    languageSettings: {
      open: "语言与无障碍设置", eyebrow: "语言包", title: "语言与无障碍", description: "只下载需要的语言，让应用保持轻量。", close: "关闭设置", listLabel: "语言包列表", voiceBeta: "语音测试版", sizeUnknown: "尚未获取大小", loading: "正在检查语言包…", loadFailed: "无法加载语言包列表。",
      status: { current: "当前使用", installed: "已安装", download: "下载", downloading: "下载中", update: "可更新", deleting: "删除中", failed: "失败 · 重试", unavailable: "翻译准备中" },
      action: { download: "下载", apply: "应用", update: "更新", delete: "删除", retry: "重试" },
      notice: { downloaded: (name) => `已安装${name}语言包。`, updated: (name) => `已更新${name}语言包。`, deleted: (name) => `已删除${name}语言包。`, failed: (name) => `${name}操作失败，请重试。` },
    },
    motion: { reaction: "反应", verifiedFact: "已验证事实", suspicion: "怀疑转移", vote: "投票变化", strong: "强关联", weak: "弱关联", conflict: "记录冲突", shifted: (count) => `${count}票转移`, held: "方向不变", eliminated: "淘汰", exposed: "身份暴露", draw: "暂无裁决" },
    habitatMapTitle: "火星居住区地图", habitatMapOpen: "手绘笔记", habitatMapAlt: "手绘地图：氧气室、控制室、储物柜与居住舱气闸通过走廊相连", habitatMapHint: "红色X标出空气净化器安全单元损坏的位置。", habitatMapLocationsLabel: "地图地点", habitatMapLocations: ["氧气室", "控制室", "储物柜", "居住舱气闸"],
    contextMedia: { accessCard: "储物柜中发现的损坏门禁卡", controlCamera: "火星标准时间22:10的控制室监控记录", oxygenRoom: "氧气室净化器与传感器记录", minaBroadcast: "米娜保存的地球直播截图", minaConcert: "火星穹顶演唱会记录", junoSensor: "朱诺正在比对的氧气室传感器", junoRestart: "空气净化器重启记录", noelReaction: "诺埃尔回看的地球直播反应", noelEdit: "诺埃尔正在检查的直播剪辑" },
    characterArchive: {
      open: (name) => `查看${name}的个人资料`, profileEyebrow: "MARS.NET 好友资料", profileTitle: (name) => `${name}的个人资料`, levelLabel: "等级", affinityLabel: "亲密度", boardLabel: "常逛论坛", traitsLabel: "推理风格", contactActions: "联系好友", message: "发消息", messageAria: (name) => `给${name}发消息`, call: "通话", callAria: (name) => `呼叫${name}`, viewPosts: (count) => `查看帖子（${count}）`, profileBack: "返回个人资料", eyebrow: "MARS.NET 匿名活动", title: (name) => `${name}的帖子档案`, lead: "与此资料相关联的历史匿名帖。本人通常坚持说‘不是我’。", close: "关闭好友资料", anonymous: "匿名", author: "楼主", youAnonymous: "匿名（你）", historyTag: "黑历史", comments: "评论", commentPlaceholder: "留下匿名评论", commentSend: "发布", sessionOnly: "你的评论只会保留到本次会话结束。", now: "刚刚", replyLoading: "输入中…", seedTimes: ["一周前", "两个月前", "三个月前"], dailyTime: (date) => `${date}的访问记录`, dailyMeta: (index) => `${4 + (index % 11)}条评论 · ${38 + (index * 17)}次浏览`,
      photoLabel: (name) => `与${name}有关的匿名帖子照片`, videoLabel: (name) => `与${name}有关的匿名帖子短视频`, stickerLabel: (name) => `很有${name}风格的MARS.NET原创反应贴纸`,
      stickerText: { mina: ["证据已保存", "那就证明啊", "快上图"], juno: ["依据太弱", "存在反例", "暂缓判断"], noel: ["刚才看到了", "语气变了", "回看片段"] },
      ambientComments: {
        mina: ["原视频画质不错", "后排这个角度应该也看得见", "多发点演出笔记吧哈哈", "有没有带截图时间的？", "最近穹顶周边配送都很慢", "分析本身挺有用"],
        juno: ["我们区传感器正常也出现了同一警告", "原始日志公开后结论可能会变", "重启前是不是该保存电力日志", "这个反例相当有力", "有人对比过其他穹顶的测量值吗？", "比起结论，我更在意核查顺序"],
        noel: ["聊天风向几秒就反了哈哈", "原片在哪？", "比声音更有意思的是弹幕反应", "回看才发现那个眼神真不对", "不知道有没有剪，但时机很怪", "下次直播也把这里存下来"],
      },
      confessionReplies: { mina: "在这里自爆？截图了哈哈", juno: "自认并不能完成验证。先核对门禁卡原始记录。", noel: "连道歉时的反应我也记了哈哈，那个停顿很关键。" },
      evidenceReplies: { mina: "有原始数据就发出来，时间也很重要。", juno: "下结论前先比较原件和反例。", noel: "看原片和发帖时间，应该能理清反应顺序。" },
      dailyTemplates: {
        mina: [
          { title: "谁有地球直播的原始截图？", body: "不要糊掉的二传，我要表情变化的那一帧。", comment: "这保存习惯也太米娜了", reply: "存截图的人多了，别乱认人" },
          { title: "这次周边我绝对不买，真的", body: "占地方，送到穹顶还慢。谁劝都不买。", comment: "那今天的购买记录是谁的？", reply: "也许是礼物。先确认事实" },
          { title: "整理了火星穹顶演出的视野", body: "每个看台角度不同。觉得有错就带截图来。", comment: "这张表太像米娜了", reply: "整理座位的人又不止一个。不是米娜" },
        ],
        juno: [
          { title: "别凭居住区警报就认定系统故障", body: "警报与确认故障是两件事。应先比较传感器原始日志。", comment: "这写法完全是朱诺", reply: "别猜作者，验证说法" },
          { title: "昨天重启后恢复，原因已确定", body: "错误无法复现，因此目前缓存故障是最合理的解释。", comment: "第二天又坏了", reply: "帖子基于当时数据，作者不重要" },
          { title: "更换安全单元前先测一个反例", body: "如果故障假设成立，其他区段日志也应出现突升。", comment: "除了朱诺谁会这么写", reply: "会测反例的人很多，专注证据" },
        ],
        noel: [
          { title: "地球直播弹幕变风向的瞬间", body: "主持人慢了半拍，整片弹幕就变了。反应顺序比画面重要。", comment: "楼主是诺埃尔吧", reply: "看反应的人多了哈哈" },
          { title: "这段肯定剪过，不接受反驳", body: "换气断点太整齐。如果原直播不是这样我就认。", comment: "原直播没剪", reply: "标题写得强，正文说的是可能" },
          { title: "他说没事之后那个眼神看到了吗？", body: "说的话一样，反应不一样。看第二遍很明显。", comment: "诺埃尔又在盯反应", reply: "谁都看得出来，别召唤诺埃尔" },
        ],
      },
      posts: {
        mina: [
          { board: "偶像粉丝论坛", time: "三天前", title: "看到地球直播舞台截图了吗？", body: "用0.25倍速看，最后那个笑是真的。我逐帧存了，反驳请带截图。", meta: "12条评论 · 84次浏览", isHistory: false, comments: [{ author: "匿名1", text: "这种截图整理也太米娜了哈哈", time: "三天前" }, { author: "楼主", text: "别什么都说是米娜？？存截图的人多了", time: "三天前", isAuthor: true }] },
          { board: "偶像粉丝论坛", time: "一个月前", title: "今晚穹顶演唱会绝对不去", body: "预告剪辑已经让我受不了。就算有余票也不去。真的。", meta: "31条评论 · 206次浏览", isHistory: true, comments: [{ author: "匿名2", text: "三小时后发现场自拍的是谁来着？", time: "一个月前" }, { author: "楼主", text: "气质像的另一个人，不是我", time: "一个月前", isAuthor: true }] },
        ],
        juno: [
          { board: "开发技术论坛", time: "五天前", title: "怀疑净化器前先检查氧气室传感器", body: "警报是事实，净化器故障是结论。没有原始日志就仍是推测。", meta: "8条评论 · 63次浏览", isHistory: false, comments: [{ author: "匿名1", text: "这句式完全是朱诺", time: "五天前" }, { author: "楼主", text: "同一论坛写法相似很正常。验证观点，别认人。", time: "五天前", isAuthor: true }] },
          { board: "开发技术论坛", time: "两个月前", title: "不是净化器故障，日志已确认", body: "更像传感器缓存问题，重启应该能解决。", meta: "19条评论 · 141次浏览", isHistory: true, comments: [{ author: "匿名3", text: "第二天不是换了安全单元吗", time: "两个月前" }, { author: "楼主", text: "标题反映当时数据。还有，楼主已经不在了。", time: "两个月前", isAuthor: true }] },
        ],
        noel: [
          { board: "直播论坛", time: "昨天", title: "地球直播弹幕变风向的瞬间", body: "主持人声音发抖前所有人都说没事。那一刻弹幕反转，反应顺序比画面有意思。", meta: "15条评论 · 119次浏览", isHistory: false, comments: [{ author: "匿名2", text: "这种反应追踪是诺埃尔绝活", time: "昨天" }, { author: "楼主", text: "看反应的人多了，别秒变侦探哈哈", time: "昨天", isAuthor: true }] },
          { board: "直播论坛", time: "三周前", title: "这段100%剪过", body: "断点太整齐。如果原片不一样我马上认。", meta: "27条评论 · 244次浏览", isHistory: true, comments: [{ author: "匿名4", text: "原片出了，没剪哈哈", time: "三周前" }, { author: "楼主", text: "100%是标题风格，正文写的是可能。还有，不是诺埃尔。", time: "三周前", isAuthor: true }] },
        ],
      },
      denialReplies: { mina: ["为什么所有截图帖都成米娜了？？只是匿名啊", "拿出我去过的证据。不是我哈哈"], juno: ["猜作者前先验证反例。", "帖子基于当时数据，但并非朱诺所写。"], noel: ["口吻相似不代表是同一个人哈哈", "大家都在聊那段，别召唤诺埃尔。"] },
      genericReplies: { mina: ["我也在意这个。有原始数据就补上。", "这个我懂，但还想看别的截图。", "也许只是喜好不同哈哈"], juno: ["存在这种可能，也比较一下反例。", "就内容而言，这是合理的质疑。", "如果有原始日志，请更新帖子。"], noel: ["我看到那个反应了哈哈，时机很怪。", "我懂这个解读，反应确实更早。", "看过原片后判断也许会变。"] },
    },
    level: { label: (level) => `Lv.${level}`, growthTitle: "好友升级", growthDetail: "下一局中，推理与反驳会更敏锐一些。" },
    difficulty: { eyebrow: "可选设置", title: "游戏难度", names: { normal: "普通", hard: "困难" }, short: { normal: "普通", hard: "HARD" }, descriptions: { normal: "按当前等级游玩", hard: "约6至7分钟 · 无草稿 · 三轮质询 · AI等级+20" }, current: (name) => `已选择${name}模式 · 可随时更改` },
    personalQuest: {
      title: "下一局支线任务", inGameLabel: "个人支线任务", accept: "接受", later: "稍后", accepted: "已接受 · 下局生效", inProgress: "进行中", success: "支线任务完成", failure: "支线任务失败", affinityGain: (score) => `亲密度 +${score}`,
      names: { "mina-shift": "改变米娜的判断", "juno-counterexample": "提出反例", "noel-consistency": "保持说法一致" }, goals: { "mina-shift": "让米娜从说谎前的判断到最终投票之间改变票向。", "juno-counterexample": "用有力支持的指控攻击你栽赃对象以外的人。", "noel-consistency": "维持最初目标，不把反驳转嫁给别人。" }, reactions: { mina: { success: "咦，真把我的票撬走了哈哈，说到做到嘛。", failure: "我的判断完全没变哈哈，下次带点别的证据。" }, juno: { success: "没有只依赖一条线索，还验证了反例。这点我认可。", failure: "方向有可能，但证据链还少一环。下次先验证反例。" }, noel: { success: "从头到尾同一个人。这次说法能对上哈哈。", failure: "最开始和中途换人了吧。以为我看不出来？哈哈" } },
    },
    journal: {
      title: "伪装职业调查日志", progress: (count) => `已在不同日期完成${count}/5次`, next: (name) => `下一条线索：今天完成一局并和${name}复盘 · 每天一条，共五个不同日期`, todayComplete: "今天的线索已获得。请在另一天再完成一局以继续。", complete: "私家侦探调查完成", clueAwarded: "获得今日线索", unlock: "解锁伪装职业：私家侦探", locked: "尚未解锁的伪装职业", groupName: "三位朋友", cluesOpen: "查看已收集线索", clueTitles: ["上锁的剪影", "职业物品", "部分能力", "优势与限制", "朋友们的结论"],
      clueBodies: [(name) => `${name}在保存记录中发现长风衣的剪影。`, (name) => `${name}指出袖珍笔记本和用旧的放大镜是下一条线索。`, (name) => `${name}推测这个职业能读出某人当前怀疑的对象。`, (name, outcome, selected) => `${name}从上一局“${outcome} · ${selected}”的结果判断：它能提前获取信息，但之后的攻击会受限制。`, () => "米娜、朱诺和诺埃尔合并了线索。伪装职业是私家侦探。"],
    },
    detective: { jobTitle: "伪装职业 · 私家侦探", equip: "装备私家侦探", playBasic: "不使用伪装职业", equipped: "本局已装备", basic: "正在使用基础状态", abilityTitle: "私家侦探调查", abilityLead: "揭示一人当前怀疑的对象，但你不能直接指控被调查者。", choose: "选择一人", inspect: (name) => `调查${name}`, revealed: (name, target) => `${name}目前怀疑${target}。`, blocked: "已调查 · 无法直接指控", cannotAccuse: (name) => `${name}已被调查，本局无法直接指控。` },
    friendChatFallback: "自动重连仍然失败，本次回应由离线模式生成。下一条消息会再次尝试实时连接。",
    friendGreetings: { record: ["啊，你来了哈哈，我刚整理截图休息一会儿。", "正好有空。你刚才在做什么？", "来了啊。游戏或闲聊都可以，我听着。"], skeptic: ["嗨。不用先有结论，随便聊。", "我现在有空。你在想什么？", "在线，听着呢。游戏以外也能聊哈哈。"], behavior: ["哦，来了。时机不错哈哈，刚才在做什么？", "没想到你会私聊，不过我在。怎么了？", "看到你上线了哈哈。今天状态几分？"] },
    selected: "✓ 已选择", select: "选择", stages: { evidence: "放置证据", facts: "确认事实", lie: "聊天指控", challenge: "聊天回应", meetingEnd: "会议结束", result: "投票结果" }, incidentHappened: "案件发生", secretMessage: "私密消息 · 仅你可见", factMarks: { alibi: "监控", access: "工具", contradiction: "时间" }, evidenceMark: "证据", subquestLabel: "支线任务！", subquestOptional: "可选挑战 · 失败无惩罚", subquestSuccess: "支线任务完成！", subquestMissed: "支线任务失败", subquestSuccessDetail: "目标完成。下一局会出现新挑战。", subquestMissedDetail: "不影响主线结果。下一局尝试其他挑战。",
    evidencePrompt: "要把这张卡放进谁的柜子？", evidenceGroup: "要栽赃的队友", plant: (name) => `栽赃${name}`, chooseOne: "选择一位队友", evidenceFound: "发现假证据", meetingTitle: (name) => `在${name}的柜子里<br />发现了门禁卡。`, roundFacts: "以下三项事实仅适用于本局。", publicFacts: "本局公开事实", clueCount: (count) => `${count}条线索`, openingStatements: "阅读队友开场发言", makeLie: "打开游戏房间聊天", yourTurn: "轮到你", chatAccuseTitle: "用自己的话栽赃一个人。", chatAccuseLead: "输入姓名和理由。快捷草稿为可选项，可自由修改。", chatHardAccuseLead: "请自行输入姓名和理由。困难模式不提供草稿。", chatReplyTitle: "亲自回应反驳。", chatReplyLead: "坚持指控、拉回被放置的卡，或要求重新核对记录。",
    hardTurn: (current, total) => `长会议 · 质询 ${current}/${total}`, hardReplyTitles: ["回应第一轮反驳。", "回应全部三轮质询。", "投票前陈述最终主张。"], hardReplyLeads: ["别忘记最初目标和公开事实。", "更换目标或与事实冲突会加深怀疑。", "发送这条消息后立即开始投票。"], hardInterpreted: (target, claim, response) => `游戏解析 · 目标 ${target} · 指控 ${claim} · 回应 ${response}`, hardFinalSubmitted: "最终辩护已发送，即将开始投票。",
    hardPracticeChallenge: (personality, target, fact, changed, conflict, round) => { if (personality === "record") { if (conflict) return `等等。公开记录是“${fact}”，与你的指控对不上。`; if (changed) return `记录中最初目标不是这个人，为什么改成${target}？`; return `第${round}轮质询已记录。再给一个基于记录怀疑${target}的理由。`; } if (personality === "skeptic") { if (conflict) return "该指控与公开事实不能同时成立。先回应反例。"; if (changed) return "如果更换目标，就说明之前的假设为何失效。"; return `还需要一个能排除${target}以外可能性的理由。`; } if (changed) return `最开始是别人，现在又是${target}？这个转向很显眼。`; if (conflict) return "公开事实已经否定你，你语气还没变。解释一下。"; return `你一直怀疑${target}，别只靠语气，拿出证据。`; },
    chatRoomTitle: "游戏房间 #041", chatTranscriptAria: "黑手党游戏房间聊天", chatSuggestions: "快捷草稿", chatSuggestionsHint: "插入后可自由修改", relationStrong: "强线索连接", relationWeak: "弱关联", relationConflict: "与事实矛盾", chatInputLabel: "消息", chatPlaceholderAccuse: "例：诺埃尔动过净化器，工具也能证明。", chatPlaceholderReply: "例：再核对一次22:10前后的记录。", chatSend: "发送", chatLength: (count) => `最多${count}字`, chatTyping: "朋友正在阅读…", chatTypingPerson: (name) => `${name}正在输入…`, chatModeLive: "朋友实时回应", chatModeMock: "离线练习回应", chatFallback: "自动重连仍然失败，本轮已使用离线模式。下一条消息会再次尝试实时连接。", chatYou: "你", chatYouMark: "我", chatNow: "刚刚", freeChat: "自由输入", chatInterpretedLie: (target, claim) => `游戏解析 · 目标 ${target} · 主要依据 ${claim}`, chatInterpretedResponse: (text) => `游戏解析 · 主要回应“${text}” · 其余细节保留原文`,
    chatPracticeReaction: (personality, name, variant) => ({ record: [`按记录看，现在${name}最可疑。`, `等等，时间线仍然指向${name}。`, `确认过了，${name}的说法最不符合记录。`], skeptic: [`只看事实，${name}仍是最大嫌疑。`, `排除推测后，${name}还是需要解释。`, `其他可能也测过了，还是${name}。`], behavior: [`${name}的反应一直让我在意，现在就盯这里。`, `大家看到${name}刚才那个转向了吗？`, `我选${name}。那个反应不能忽略。`] })[personality][variant % 3],
    chatPracticeDecision: (personality, name, variant) => ({ record: [`我选${name}，记录指向那里。`, `顺着时间线，投票对象就是${name}。`, `已保存记录。我投${name}。`], skeptic: [`即使排除推测，${name}仍最可疑。`, `只留下确定事实，结果就是${name}。`, `反例也查过了，${name}仍最符合。`], behavior: [`${name}。最后的反应让我确定了。`, `看完最后回应，我投${name}。`, `${name}的语气变了好几次，就投这里。`] })[personality][variant % 3],
    friendPracticeReply: (personality, variant, message) => ({ record: [`“${message}”这句我存了哈哈，再说点。`, `明白。“${message}”是你最想说的吗？`, `我在整理。“${message}”最让我在意。`], skeptic: [`明白。“${message}”更接近事实还是感受？`, `有这种可能。你为什么会得出“${message}”？`, `知道了。想过其他解释吗？`], behavior: [`你说“${message}”的语气，一看就有事哈哈`, `听语气，你比自己以为的更在意。`, `嗯，听得出来你就是想聊这个。继续。`] })[personality][variant % 3],
    audioStart: "播放背景音乐", audioMute: "背景音乐静音", audioUnmute: "打开背景音乐", audioVolume: "背景音乐音量", audioVoiceMuted: "语音通话期间背景音乐已静音", debriefOpen: "查看赛后好友聊天", debriefRequest: "三个人聊聊刚结束的游戏。", debriefTitle: "正在复盘上一局", debriefLead: "朋友们记得刚才的选择和结果。", debriefSummary: "上一局", debriefOutcome: { win: "胜利", lose: "身份暴露", draw: "平局" }, debriefNoSelection: "无人被选中", debriefRoundLine: (planted, accused, selected) => `你栽赃了${planted}，指控了${accused}，最终${selected}被选中。`, debriefFallback: "自动重连仍然失败，现显示基于角色性格生成的离线对话。下一次请求会再次尝试实时连接。", debriefHome: "主页",
    debriefPractice: { record: (selected) => `最后票都流向${selected}的过程值得存档哈哈`, skeptic: (accused) => `我理解怀疑${accused}的理由。下次也测一下反例。`, behavior: (outcome) => `“${outcome}”出来那刻气氛都变了哈哈，下局也挺期待。` }, chatDecisionTitle: "房间已经形成结论。", chatDecisionLead: "公开投票前，先查看聊天中的怀疑如何变化。", yourResponse: "你的最终回应", preVoteAria: "投票前各队友的判断", showVote: "公开投票结果", voteShiftAria: "说谎前后的判断变化", beforeAfter: "说谎前 → 最终判断", changed: "票向已改变", unchanged: "维持原判断", resultAria: "队友投票及理由", nextRoundTitle: "下一局：新事实与支线任务", nextRoundDetail: "朋友不变，但线索变化会带来不同反应。", restart: "使用新事实开始下一局",
    result: {
      tiers: { mastermind: "完美误导 · ★★★", manipulator: "操纵票向 · ★★", survivor: "避开怀疑 · ★" }, drawEyebrow: "投票无效", loseEyebrow: "身份暴露", drawTitle: "无人被淘汰。", winTitle: (name) => `${name}被淘汰`, loseTitle: "你被淘汰。", drawDescription: "三票分散。你保住了身份，但没能淘汰任何人。", shiftedDescription: (count) => `你的选择撬动了${count}票。`, safeDescription: "票向没有改变，但怀疑也没有集中到你身上。", loseDescription: "其他玩家发现了你说法中的矛盾。", drawWhy: "为什么投票无效？", shiftWhy: "什么改变了票向？", safeWhy: "为什么避开了怀疑？", loseWhy: "为什么身份暴露？", drawExplanation: "三个人分别投给不同对象，没有任何人达到两票多数。", loseExplanation: "你的指控与事实矛盾或多次改变，怀疑最终回到你身上。", redirectedExplanation: (name, count) => `你把票从被栽赃者引向了${name}。最终判断中有${count}项与说谎前不同。`, safeExplanation: "被放置的门禁卡本身就制造了足够怀疑，让你安全获胜，没有新增票向变化。", shiftedExplanation: (count) => `被放置的卡和之后的说法改变了${count}项最终判断。`, splitExplanation: "队友判断分散，但你以外的某人获得了最高票。",
    },
  },
  friendRoom: {
    meta: {
      title: "MARS.NET · 好友房间", back: "返回单人主页", language: "语言",
      themeControl: (name) => `显示模式：${name}。点击切换`,
      themes: { system: "自动", light: "浅色", dark: "深色" },
      audio: { start: "播放背景音乐", mute: "关闭背景音乐", unmute: "打开背景音乐", volume: "背景音乐音量" },
    },
    entry: {
      eyebrow: "双人实时游戏", title: "和好友来一局黑手党？", lead: "分享链接，与两位火星居民好友一起游玩。",
      create: "创建房间", join: "输入代码加入", code: "房间代码", codePlaceholder: "6位代码", name: "显示名称", namePlaceholder: "1至12个字符", avatar: "内置头像", submitCreate: "创建房间", submitJoin: "加入房间", privacy: "上传的个人头像不会分享给其他人。",
    },
    connection: { connected: "已连接", reconnecting: "正在重新连接…", disconnected: "连接已断开", expired: "房间已过期。", end: "结束房间" },
    lobby: { eyebrow: "MARS.NET 私密房间", title: "正在等待好友", code: "房间代码", copy: "复制邀请链接", copied: "已复制", ready: "准备完成", cancelReady: "取消准备", waiting: "正在等待第二位玩家…", player: "真人玩家", character: "MARS.NET 火星居民", rotation: "两位火星居民好友每局轮换。" },
    role: { eyebrow: "仅自己可见的秘密身份", mafia: "你是黑手党。", citizen: "你是平民。", mafiaLead: "用伪造证据和聊天，让另一位参与者获得两票。", citizenLead: "阅读聊天和公开事实，找出黑手党。你的最终选择计一票。", confirm: "确认身份", wait: "正在等待对方确认身份…" },
    plant: { title: "放置伪造证据。", lead: "选择一个柜子，放入损坏的门禁卡。", wait: "黑手党正在准备事件…", action: (name) => `栽赃${name}` },
    facts: { eyebrow: "公开事实", title: "火星标准时间22:10 · 氧气室", lead: "净化器安全装置发生故障。通过聊天找出谁在说谎。", confirm: "确认事实并打开聊天", wait: "正在等待对方确认事实…" },
    chat: { title: "实时推理聊天", lead: "两位真人玩家的发言会影响实际怀疑判断。", placeholder: "说说你怀疑谁，以及理由", send: "发送", typing: (name) => `${name}正在输入…`, voteTitle: "平民最终投票", voteLead: "你的一票将与两位火星居民的票合并计算。", vote: (name) => `投票给${name}`, mafiaWait: "平民正在选择最终投票。", emoji: "表情" },
    result: {
      mafiaWin: "黑手党获胜", mafiaLoss: "平民获胜", draw: "投票无效", selected: (name) => `${name}获得了至少两票。`, drawLead: "票数分成1–1–1，无人出局。", roles: "身份公开", votes: "最终投票", reasonManual: "真人平民直接选择的一票", reasonEvidence: "综合公开事实与已验证聊天作出判断",
      reactions: {
        mafia_win: { mina: "刚才那波票数变化我截图了，这局算你厉害。", juno: "聊天走势压过了伪造证据。下一局先检验反例。", noel: "看到最后气氛怎么翻了吗？时机抓得不错。" },
        mafia_loss: { mina: "你的说法和记录对不上时，我一下就看出来了。下局记得圆好。", juno: "有一项主张和公开事实冲突。下次把假设验证到底。", noel: "你中途反应变了，太明显了。下局把说法保持一致。" },
        draw: { mina: "三票全分开也太绝了，这局得存下来。", juno: "证据指向三个方向，无法形成结论。值得再来一局。", noel: "到最后大家都没定下来。再玩一局应该能看出来。" },
      },
      rematch: "交换身份再来一局", rematchWaiting: "正在等待对方准备重赛…",
    },
    errors: { generic: "无法处理该请求。", stale_event: "房间状态已变化，已恢复最新状态。", rapid_duplicate: "不能立即重复发送相同消息。", room_expired: "房间已过期。", room_full: "该房间已满。", invalid_locale: "暂不支持该语言。" },
  },
  account: {
    guest: "访客 · 保存在本设备", signedIn: "正在保存到云端", saved: "已保存到云端", syncing: "正在同步", pending: "等待同步",
    saveTitle: "将记录保存到账号", saveLead: "登录后可在其他设备继续成长进度、对局记录和私聊。", saveAction: "登录并保存记录",
    accountTitle: "MARS.NET 账号", loginLead: "你仍可继续以访客身份游玩。登录后会安全合并本设备记录。", google: "使用Google继续", email: "使用邮箱继续", guestAction: "以访客身份开始",
    authEyebrow: "2050 · MARS.NET", authTitle: "好友正在火星等你", authLead: "登录并继续记录，或直接以访客身份开始。", authLoading: "正在检查账号连接…", guestNote: "无需注册即可开始。进度将保存在本设备。",
    privacyPolicy: "隐私政策", termsOfService: "服务条款", emailLoginTitle: "使用邮箱登录", emailSignupTitle: "创建MARS.NET账号", emailResetTitle: "重置密码", recoveryTitle: "设置新密码",
    emailLabel: "邮箱", passwordLabel: "密码", passwordConfirmLabel: "确认密码", passwordHint: "请输入至少8个字符。", emailPlaceholder: "you@example.com",
    loginAction: "登录", signupAction: "创建账号", resetAction: "发送重置邮件", updatePasswordAction: "保存新密码", forgotPassword: "忘记密码？", createAccount: "第一次来？创建账号", existingAccount: "已有账号？登录", back: "返回",
    confirmationSent: "确认邮件已发送。完成验证后请登录。", resetSent: "如果该地址已注册，重置邮件将发送到你的邮箱。", passwordUpdated: "密码已更新。", invalidEmail: "请输入有效的邮箱地址。", passwordMismatch: "两次输入的密码不一致。", authError: "请检查登录信息，或稍后重试。",
    providerGoogle: "Google", providerEmail: "邮箱", unavailable: "云端保存尚未配置。游戏仍会保存在本设备。", connected: "已连接的登录方式", lastSync: "上次同步", never: "暂无", export: "将全部记录导出为JSON", deleteChats: "按角色删除聊天", deleteChat: (name) => `删除与${name}的聊天`, logout: "退出登录", deleteAccount: "删除账号和云端记录", feedback: "向创作者发送反馈或问题", close: "关闭账号窗口",
    confirmChatDelete: "删除与该角色的全部已保存聊天？此操作无法撤销。", confirmAccountDelete: "删除账号、成长记录、对局记录、私聊和头像？此操作无法撤销。", reauth: "为确保安全，请重新登录后再删除账号。", error: "云端连接失败。你仍可继续本地游玩。",
    characters: { mina: "米娜", juno: "朱诺", noel: "诺埃尔" },
  },
};

let staging = globalThis[STAGING_KEY];
if (!staging) {
  staging = new Map();
  globalThis[STAGING_KEY] = staging;
}
staging.set("zh-CN", { schemaVersion: PACK_SCHEMA_VERSION, version: PACK_VERSION, pack });

export default pack;
