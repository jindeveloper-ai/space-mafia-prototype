export const PACK_SCHEMA_VERSION = 1;
export const PACK_VERSION = "0.20.14";

const STAGING_KEY = Symbol.for("mars.net.language-pack-staging.v1");
const trimEnd = (text) => text.replace(/[。.!?！？]+$/u, "");

const pack = {
  meta: {
    title: "MARS.NET · 遊戲房間 #041",
    description: "同三個生活在2050年火星上嘅朋友一起玩嘅三分鐘黑手黨推理傾偈遊戲。",
    brand: "MARS.NET", gameInfo: "遊戲資訊", home: "返回遊戲開始頁",
    footer: "MARS.NET 好友房間 · 訪客紀錄保存喺本設備，登入後同步到雲端",
    language: "選擇語言", themeModes: { system: "自動", light: "淺色", dark: "深色" },
    themeControl: (mode) => `顯示模式：${mode}。按下即可切換`,
  },
  crew: {
    mina: { name: "米娜", icon: "M", style: "偶像粉絲論壇 · 秒存截圖派", background: "佢係地球移民嘅女兒，出生並長大喺火星。佢追地球直播同火星演唱會，對截圖同時間線格外敏銳，但遇到本命時偶爾會偏心。講嘢像粉絲論壇一樣快而有情緒。" },
    juno: { name: "朱諾", icon: "J", style: "開發技術論壇 · 驗證反例派", background: "佢係地球移民嘅女兒，出生並長大喺火星，負責維護居住區生命保障設備。佢會區分事實同推測，並懷疑過分完美嘅證據。唔賣弄術語，講嘢重視驗證。" },
    noel: { name: "諾爾", icon: "N", style: "直播論壇 · 緊盯反應變化派", background: "佢係地球移民嘅女兒，出生並長大喺火星，成日睇連接地球同火星嘅直播。佢好快就能察覺措辭同反應嘅變化，會先睇得出氣氛，再簡短地點出要害。" },
  },
  incident: {
    title: "空氣淨化設備停機", place: "居住區 · 氧氣室", time: "22:10 火星標準時",
    confirmed: "居住區空氣淨化設備嘅安全鎖畀人整壞咗。",
    description: "火星標準時22:10，居住區氧氣室內嘅空氣淨化設備安全鎖畀人整壞咗。請利用同地點同時間相關嘅線索，把嫌疑引向其他人。",
    evidence: "損壞嘅門卡",
  },
  claims: {
    seen: { short: "在氧氣室目擊", action: "由氧氣室行出嚟", challengeAction: "由氧氣室行出嚟" },
    machine: { short: "動過淨化器", action: "動過空氣淨化設備", challengeAction: "動過空氣淨化設備" },
    changed: { short: "改過講法", action: "改過案發時間嘅講法", challengeAction: "改過案發時間嘅講法" },
  },
  facts: {
    alibi: {
      title: "監控紀錄", text: (name) => `${name}喺22:10出現喺控制室監控中。`, spokenText: (name) => `${name}喺22:10確實被控制室監控拍到。`,
      firstPersonText: (personality) => ({ record: "等等，我22:10明明就喺控制室監控入面。睇紀錄。", skeptic: "目前可以確定嘅只有：22:10我出現喺控制室監控入面。", behavior: "22:10我喺控制室，監控都拍到。" })[personality],
      badge: "強地點不在場證明", guidance: "同‘由氧氣室行出嚟’或‘動過淨化器’嘅講法矛盾。", baseReason: (name) => `${name}喺22:10出現喺控制室監控中，唔太可能同時留喺氧氣室`,
    },
    access: {
      title: "氧氣室專用工具", text: (name) => `${name}嘅口袋入面裝住氧氣室專用工具。`, spokenText: (name) => `${name}攞住氧氣室工具係事實。`,
      firstPersonText: (personality) => ({ record: "我承認口袋入面有氧氣室工具。然後呢，咁可以證明咩？", skeptic: "可以確定嘅只有工具在我口袋入面，後面嘅結論都仲係推測。", behavior: "工具喺我度。不過你馬上咬住呢點，仲幾有趣。" })[personality],
      badge: "地點關聯線索", guidance: "支持同氧氣室或空氣淨化設備有關嘅講法。", baseReason: (name) => `${name}持有氧氣室專用工具，具備入去現場嘅條件`,
    },
    contradiction: {
      title: "時間講法矛盾", text: (name) => `${name}對案發時間講咗兩個唔同版本。`, spokenText: (name) => `${name}講過兩個唔同時間，呢係事實。`,
      firstPersonText: (personality) => ({ record: "我糾正過時間，只係第一次睇錯紀錄。", skeptic: "我糾正咗時間。呢同改變整套講法要分開睇。", behavior: "時間確實講錯過。但你咁快就撲上嚟，都幾顯眼。" })[personality],
      badge: "時間矛盾", guidance: "最有力地支持‘改過講法’呢一指控。", baseReason: (name) => `${name}對22:10前後嘅時間講法唔一，降低咗不在場證明嘅可信度`,
    },
  },
  subquests: {
    redirect: { title: "淘汰並非你栽贓對象嘅人。" }, "check-time": { title: "喺最後回覆中核對22:10紀錄並獲勝。" }, "weak-link": { title: "用關聯薄弱嘅謊言獲勝。" }, "safe-win": { title: "帶動至少一票，並以★★或更高評價獲勝。" },
  },
  engine: {
    player: "你", unknown: "未知", clueCount: (count) => `${count}條線索${count > 0 ? "已連結" : ""}`,
    errors: { evidenceTarget: "請選擇要栽贓嘅對象。", evidenceFirst: "請先放置假證據。", accused: "請選擇懷疑對象。", claim: "請選擇要使用嘅指控。", challengeFirst: "請在其他玩家反駁後再回覆。", response: "請選擇回覆。", responseFirst: "請先完成最後回覆再投票。", hardDefenseFirst: "請按困難模式而家質詢順序作答。" },
    meetingFramed: (personality) => ({ record: "有人將嗰張卡塞咗入我個儲物櫃。先由呢查啦。", skeptic: "張卡喺我個儲物櫃入面係事實，但放卡嘅人仲未確定。", behavior: "嗰張卡唔係我嘅。卡一出現，大家就撲過嚟，幾有趣。" })[personality],
    claimLabel: (name, action) => `${name}${action}`,
    challengeContradiction: (fact, name, action, self, personality) => { const subject = self ? "我" : name; if (personality === "record") return `${fact} 咁點可以講${subject}${action}？同紀錄對唔上。`; if (personality === "skeptic") return `${fact} 點解仲講${subject}${action}？兩者至少有一個唔成立。`; return `等等。${fact} 點會變成${subject}${action}了？`; },
    challengeSelf: (fact, personality) => { if (personality === "record") return `${fact} 光憑呢要放逐我？講真？`; if (personality === "skeptic") return `${fact} 可以確定嘅只有呢啲，其餘都仲係推測。`; return `${fact} 呢線索一出嚟，你哋就淨係盯住我啦？`; },
    challengeWeak: (fact, name, personality) => { if (personality === "record") return `${fact} 咁可以證明係${name}做嘅呀？`; if (personality === "skeptic") return `${fact} 可以確定嘅只有呢啲。${name}係黑手黨都仲係推測。`; return `${fact} 光憑呢直接點${name}？係咪太快？`; },
    responseOptions: (target, time, sameTarget) => [
      { id: "double-down", label: "“相信我親眼睇到嘅”", hint: "堅持最初嘅指控" },
      { id: "return-evidence", label: `“但張卡仲係喺${target}嘅儲物櫃入面找到嘅”`, hint: sameTarget ? "繼續懷疑同一對象" : `唔再反擊，將話題拉回${target}` },
      { id: "check-time", label: `“再睇一遍${time}前後嘅紀錄”`, hint: "核對案發時間同所有人嘅講法" },
    ],
    reasons: {
      framedSelf: "我知道有人把門卡塞咗入我嘅儲物櫃", evidenceCard: (name) => `損壞嘅門卡喺${name}嘅儲物櫃入面搵到`, accusedKnows: "我知道針對自己嘅指控係假嘅", claimSupports: (fact) => `該指控符合現有線索——${trimEnd(fact)}`, claimContradicts: (fact) => `該指控同確認事實矛盾——${trimEnd(fact)}`, evidenceMatches: "門卡同指控指向同一個人", tooPerfect: "證據同講法吻合得過於完美", changedMatters: "講法變化值得納入判斷", maintainedClaim: "遭到反駁後仍堅持同一指控", ignoredFact: "無視已確認事實，強行堅持矛盾講法", overconfidence: "自信程度超過證據所能支持嘅範圍", confidenceSuspicion: "呢份篤定本身就好可疑", reusedFrame: "再次用返塞入我儲物櫃嘅證據", returnedCard: "將話題重新拉回損壞嘅門卡", changedTarget: "首次指控後換咗目標", repeatedEvidence: "由頭到尾只重複同一證據，太刻意了", timeContradiction: "22:10前後嘅講法唔一致", alibiClears: "22:10嘅控制室監控支持被指控者嘅不在場證明", noTimeConflict: "核對時間後，被指控者嘅位置冇矛盾", hardConsistent: "質詢過程中始終保持同一目標同依據", hardTargetChanged: "長會議中途換咗最初目標", hardFactConflict: "反複提出同公開事實矛盾嘅指控", weakAlibi: "不在場證明比其他人薄弱",
      join: (first, second) => `${trimEnd(first)}。另外，${trimEnd(second)}`, record: (reason) => `紀錄指向呢度：${trimEnd(reason)}。我投呢個`, skeptic: (reason) => `${trimEnd(reason)}。將事實同推測分開睇，呢個先最合理`, behavior: (reason) => `${trimEnd(reason)}。最後嘅反應已經講明問題，我投呢個`,
    },
  },
  ui: {
    stepAria: (step, label) => `第${step}步：${label}`, profileDefaultName: "你", welcomePill: "2050 · MARS.NET", welcomeTitle: "今晚喺火星玩一局黑手黨？", welcomeLead: "唔使擔心鬧交，同三個朋友玩返場三分鐘推理遊戲。", welcomeStart: "開始", profileBack: "返回開始頁", profileStep: "MARS.NET 個人資料", profileTitle: "該點稱呼你？", profileLead: "顯示名稱會出現喺遊戲房間同私訊中。", profilePhoto: "選擇頭像", profilePhotoOptional: "可選 · JPG、PNG、WebP · 最大2MB", profileName: "顯示名稱", profileNamePlaceholder: "1至12個字", profileContinue: "保存並繼續", profilePrivacy: "訪客資料保存喺本設備，登入後將安全同步。", profilePhotoError: "請選擇唔超過2MB嘅JPG、PNG或WebP圖片。",
    homeTutorial: "開啟遊戲教程", homeHello: (name) => `${name} 👋`, homeTitle: "想做咩？", homePlayEyebrow: "三分鐘遊戲", homePlayTitle: "開始黑手黨遊戲", homePlayLead: "三個AI朋友 · 約三分鐘", homeMultiplayerEyebrow: "雙人在線對戰", homeMultiplayerTitle: "同朋友一起玩", homeMultiplayerLead: "分享代碼，一起推理", homeBack: "返回主頁", bottomNav: { aria: "主菜單", game: "遊戲", chat: "傾偈", me: "我嘅" }, tutorialLabel: "2050 · MARS.NET", tutorialTitle: "遊戲教程", incidentAria: "案件事實", incidentPlace: "地點", incidentTime: "時間",
    communityBoard: "MARS.NET 閒聊論壇 · 啱啱", communityAuthor: "匿名", communityPostTitle: "【歡迎新手】黑手黨仲差一個人（3/4）", communityPostBody: "歡迎新手，唔互相攻擊。已經有三個人，最後一個嚟呀？", communityPostMeta: "3條留言 · 17次瀏覽", sceneSetting: "2050年，仲住喺地球嘅你休息時睇MARS.NET，見到火星朋友出咗個歡迎新手嘅組隊帖。", roomBadge: "MARS.NET · 房間 #041", roomMembers: "火星出生嘅第二代朋友", roomStatus: "3人在線", online: "在線", roleLabel: "今局秘密身份", introTitle: "你係黑手黨。", introLead: "利用假證據同謊言，令其他人攞到兩票。", rulesAria: "遊戲規則", rules: ["把<strong>假證據</strong>放進一個人嘅儲物櫃。", "睇三個人嘅<strong>現有事實</strong>。", "喺遊戲傾偈中講出<strong>你嘅謊言</strong>。", "普通模式回覆一次；困難模式需連續回答<strong>三回合質詢</strong>。", "其他人攞到<strong>兩票</strong>你就贏；你攞到兩票則輸。"], start: "入去遊戲房間",
    voice: {
      modeTitle: "選擇遊玩方式", playText: "文字傾偈", playVoice: "語音通話", textModeDescription: "睇你輸入嘅指控同回覆嘅標準傾偈遊戲", voiceModeDescription: "在限時內多次開口回覆嘅專用通話遊戲", consentEyebrow: "AI語音通話模式", consentTitle: "要用麥克風同三個朋友傾偈呀？", consentLead: "每輪可連續對話。時間結束時，以你最後一次明確表達嘅立場作出判定。", disclosures: ["通話期間會使用麥克風。", "語音會發送至OpenAI API進行處理。", "App唔會保存原始音訊。依據OpenAI政策，安全監測資料可能最多保留30天。", "你可以拒絕麥克風權限，改用文字模式。"], consentAction: "同意並啟用麥克風", textFallback: "繼續文字傾偈", callTitle: "MARS.NET 語音遊戲", callStage: "房間 #041 · 語音會議", captionLabel: "即時字幕", captionOn: "開啟字幕", captionOff: "關閉字幕", mute: "麥克風靜音", unmute: "開啟麥克風", pause: "暫停AI語音", resume: "繼續AI語音", callEffectsOn: "通話音效開啟", callEffectsOff: "通話音效關閉", callEffectsAria: "切換AI語音嘅電話音效", end: "結束語音通話", reconnect: "重新連線", talkStart: "手動開始講嘢", talkStop: "結束手動輸入", talkStartHint: "通常唔使使用，僅在自動檢測失效時啟用。", talkStopHint: "講完後按下此按鈕發送手動輸入", textInputHint: "語音識別停止時，可喺同一會議中輸入文字", textInputPlaceholder: "喺呢個語音會議中輸入", turnLabel: (current, total) => `語音討論 ${current}/${total}`, secondsLeft: (seconds) => `剩餘${seconds}秒`, preparingTurn: "而家準備下個回合討論", turnHelp: "時間結束前可多次開口回覆。", turnClosing: "結束今個回合交流，入去下個回合。", nextTurnPrompt: (current, total) => `而家係第${current}/${total}輪。再講一個理由。`, finalPosition: (target, claim) => `時間到 · 最終主張：${target} · ${claim}`,
      status: { idle: "通話準備就緒", requesting_permission: "而家確認麥克風權限", connecting: "而家連線朋友", listening: "自動聆聽中 · 直接講嘢即可", player_speaking: "聽緊你講嘢", processing: "而家確認你嘅發言", ai_speaking: "而家發言", paused: "AI語音已暫停", reconnecting: "連線唔穩定", ended: "通話已結束", fallback_text: "繼續使用文字模式" }, inputStatus: { connecting: "而家檢查麥克風連線", listening: "麥克風已開 · 請講嘢", speaking: "檢測到語音", processing: "而家發送頭先嘅發言", ai: "朋友而家回覆 · 結束後會恢復聆聽", muted: "麥克風已靜音" }, inputStatusHint: "檢測到聲音時，麥克風外圈同圓點會變綠。", speaking: (name) => `${name}講緊嘢`, waitingCaption: "開始講嘢後，已確認嘅字幕會顯示喺呢度。", clarificationTarget: "你懷疑米娜、朱諾定係諾爾？", clarificationClaim: "係因為有人見到佢喺氧氣室、佢郁過淨化器，定係佢改過時間？", fallbackNotice: "語音暫唔可用。請重新連線，或明確切換到文字傾偈。", switchedToText: "會繼續使用標準文字傾偈模式。",
    },
    friendChatOpen: "一對一傾偈", friendChatEyebrow: "遊戲外都在線", friendChatTitle: "好友傾偈", friendChatSelectLead: "選擇傾偈對象", friendChatSelectTitle: "想畀邊個發信息？", friendChatSelectDescription: "傾遊戲，都可以傾日常。三個人嘅講嘢同思考方式各唔相同。", friendChatBack: "返回好友列表", friendChatWith: (name) => `同${name}傾偈`, friendChatDay: "私訊 · 今日", friendChatOlder: "載入更早信息", friendChatOlderLoading: "而家載入更早信息…", friendTranscriptAria: (name) => `同${name}嘅私訊`, friendChatPlaceholder: (name) => `畀${name}發信息`, friendEmojiOpen: "開啟表情選擇器", friendEmojiPicker: "快捷表情", friendEmojiInsert: (emoji) => `插入${emoji}表情`, friendSticker: "動態貼紙", friendStickerPicker: "MARS.NET原創動態貼紙", friendStickerSend: (label) => `發送“${label}”貼紙`, friendChatPrivacy: "訪客信息保存喺本設備，登入後會私密保存到雲端",
    friendCall: {
      start: "語音通話", startAria: (name, seconds) => `呼叫${name} · 今日剩餘${Math.floor(seconds / 60)}分${seconds % 60}秒`, title: (name) => `同${name}語音通話`, dailyLimit: "每日5分鐘 · 而家好友", remaining: (clock) => `今日剩餘${clock}`, location: (name) => `${name} · 火星居住區`, end: "結束通話", mute: "靜音", unmute: "取消靜音", callEffectsOn: "通話音效開啟", callEffectsOff: "通話音效關閉", callEffectsAria: "切換好友語音嘅電話音效", textFallback: "文字輸入", textPlaceholder: "麥克風未識別時請打字", privacy: "唔會保存原始音訊，只會喺本設備或帳戶中保存通話時長。", limitReached: "今日同呢位好友嘅5分鐘已用晒。",
      status: { idle: "而家準備通話…", requesting_permission: "而家連線麥克風…", dialing: "等待接聽…", connecting: "而家連線…", answered: "通話已接通", player_speaking: "而家發送你嘅聲音", thinking: "聽緊…", ai_speaking: "通話中", listening: "等待你講嘢", ended: "通話已結束", error: "冇辦法接通" }, micStatus: { requesting_permission: "而家連線麥克風", dialing: "而家呼叫", answered: "已接通", player_speaking: "你講緊嘢", thinking: "而家準備回覆", ai_speaking: "好友講緊嘢", listening: "麥克風已開", error: "通話錯誤", ended: "通話已結束" }, error: { friend_call_unsupported: "此瀏覽器唔支持語音通話。", friend_call_secret_failed: "冇辦法獲取語音通話連線資訊。", friend_call_daily_limit: "今日同呢位好友嘅5分鐘已用晒。", guest_friend_call_daily_limit: "今日嘅訪客連線次數已達上限，請明天再試吓。", friend_call_negotiation_failed: "冇辦法連線通話伺服器，請陣間再試吓。", friend_call_channel_timeout: "通話連線超時。", friend_call_channel_failed: "冇辦法開啟通話資料通道。", microphone_missing: "未找到可用麥克風。", microphone_denied: "請在Chrome同macOS設定中允許麥克風權限。", microphone_timeout: "麥克風連線太耐，已轉用文字模式。", default: "連線通話時出現問題，請再試。" },
    },
    affinity: (score) => `親密度 ${score}`,
    languageRestartConfirm: "更改語言將結束而家遊戲並返回開始頁。要唔要繼續？",
    languageSettings: {
      open: "語言同無障礙設定", eyebrow: "語言包", title: "語言同無障礙", description: "只下載需要嘅語言，令App保持輕量。", close: "關閉設定", listLabel: "語言包列表", voiceBeta: "語音 Beta", sizeUnknown: "尚未獲取大小", loading: "而家檢查語言包…", loadFailed: "冇辦法載入語言包列表。",
      status: { current: "目前使用", installed: "已安裝", download: "下載", downloading: "下載中", update: "可更新", deleting: "刪除中", failed: "失敗 · 再試", unavailable: "翻譯準備中" },
      action: { download: "下載", apply: "套用", update: "更新", delete: "刪除", retry: "再試" },
      notice: { downloaded: (name) => `已安裝${name}語言包。`, updated: (name) => `已更新${name}語言包。`, deleted: (name) => `已刪除${name}語言包。`, failed: (name) => `${name}操作失敗，請再試。` },
    },
    motion: { reaction: "反應", verifiedFact: "已核實事實", suspicion: "懷疑轉向", vote: "票向變化", strong: "關聯好強", weak: "關聯較弱", conflict: "同紀錄撞咗", shifted: (count) => `${count}票轉向`, held: "票向不變", eliminated: "出局", exposed: "身份曝光", draw: "未有定論" },
    habitatMapTitle: "火星居住區地圖", habitatMapOpen: "手繪筆記", habitatMapAlt: "手繪地圖：氧氣室、控制室、儲物櫃同居住艙氣閘通過走廊相連", habitatMapHint: "紅色X標出空氣淨化設備安全單元損壞嘅位置。", habitatMapLocationsLabel: "地圖地點", habitatMapLocations: ["氧氣室", "控制室", "儲物櫃", "居住艙氣閘"],
    contextMedia: { accessCard: "儲物櫃中發現嘅損壞門卡", controlCamera: "火星標準時22:10嘅控制室監控紀錄", oxygenRoom: "氧氣室淨化器同感應器紀錄", minaBroadcast: "米娜保存嘅地球直播截圖", minaConcert: "火星圓頂場館演唱會紀錄", junoSensor: "朱諾而家比對嘅氧氣室感應器", junoRestart: "空氣淨化設備重啟紀錄", noelReaction: "諾爾回睇嘅地球直播反應", noelEdit: "諾爾而家檢查嘅直播剪輯" },
    characterArchive: {
      open: (name) => `睇${name}嘅個人資料`, profileEyebrow: "MARS.NET 好友資料", profileTitle: (name) => `${name}嘅個人資料`, levelLabel: "等級", affinityLabel: "親密度", boardLabel: "常逛論壇", traitsLabel: "推理風格", contactActions: "聯系好友", message: "發信息", messageAria: (name) => `畀${name}發信息`, call: "通話", callAria: (name) => `呼叫${name}`, viewPosts: (count) => `睇帖文（${count}）`, profileBack: "返回個人資料", eyebrow: "MARS.NET 匿名活動", title: (name) => `${name}嘅帖文檔案`, lead: "同此資料相關聯嘅歷史匿名帖。本人通常堅持講‘唔係我’。", close: "關閉好友資料", anonymous: "匿名", author: "原 PO", youAnonymous: "匿名（你）", historyTag: "黑歷史", comments: "留言", commentPlaceholder: "留下匿名留言", commentSend: "發布", sessionOnly: "你嘅留言只會保留到本次會話結束。", now: "啱啱", replyLoading: "輸入緊…", seedTimes: ["一週前", "兩個月前", "三個月前"], dailyTime: (date) => `${date}嘅訪問紀錄`, dailyMeta: (index) => `${4 + (index % 11)}條留言 · ${38 + (index * 17)}次瀏覽`,
      photoLabel: (name) => `同${name}有關嘅匿名帖文照片`, videoLabel: (name) => `同${name}有關嘅匿名帖文短片段`, stickerLabel: (name) => `好有${name}風格嘅MARS.NET原創反應貼紙`,
      stickerText: { mina: ["證據已保存", "嗰就證明啊", "快上圖"], juno: ["依據太弱", "存在反例", "暫緩判斷"], noel: ["頭先睇到了", "語氣變了", "回睇片段"] },
      ambientComments: {
        mina: ["原片畫質唔錯", "後排呢個角度應該都睇得見", "多發點演出筆記啦哈哈", "有冇帶截圖時間嘅？", "最近圓頂場館周邊配送都好慢", "分析本身幾有用"],
        juno: ["我哋區感應器正常都出現咗同一警告", "原始日誌公開後結論可能會變", "重啟前係唔係該保存電力日誌", "呢個反例相當有力", "有人對比過其他圓頂場館嘅測量值呀？", "比起結論，我更在意核查順序"],
        noel: ["傾偈風向幾秒就反咗哈哈", "原片喺邊？", "比聲音更有趣嘅係聊天室反應", "重睇先發現嗰個眼神真唔對", "唔知道有冇剪，但時機好怪", "下次直播都將呢度保存低"],
      },
      confessionReplies: { mina: "喺呢度自爆？已經截咗圖哈哈", juno: "自認並唔可以完成驗證。先核對門卡原始紀錄。", noel: "連道歉時嘅反應我都記咗哈哈，嗰個停頓好關鍵。" },
      evidenceReplies: { mina: "有原始資料就放上嚟，時間都好重要。", juno: "下結論前先比較原件同反例。", noel: "睇原始片段同發帖時間，應該能理清反應順序。" },
      dailyTemplates: {
        mina: [
          { title: "邊個有地球直播嘅原始截圖？", body: "唔好糊掉嘅二傳，我要表情變化嘅嗰一幀。", comment: "呢種保存習慣一睇就知係米娜", reply: "存截圖嘅人多咗，唔好亂認人" },
          { title: "今次周邊我絕對唔買，真係", body: "占地方，送到圓頂場館仲慢。邊個勸都唔買。", comment: "嗰今日嘅購買紀錄係邊個嘅？", reply: "可能係禮物。先確認事實" },
          { title: "整理咗火星圓頂場館演出嘅視野", body: "每個觀眾席角度唔同。覺得有錯就帶截圖來。", comment: "呢張表太像米娜了", reply: "整理座位嘅人又唔止一個。唔係米娜" },
        ],
        juno: [
          { title: "唔好憑居住區警報就認定系統故障", body: "警報同確認故障係兩件事。應先比較感應器原始日誌。", comment: "呢寫法完全係朱諾", reply: "唔好估作者，驗證講法" },
          { title: "尋日重啟後恢復，原因已確定", body: "錯誤冇辦法複現，因此目前暫存故障係最合理嘅解釋。", comment: "第二日又壞了", reply: "帖文基於當時資料，作者唔重要" },
          { title: "更換安全單元前先測一個反例", body: "如果故障假設成立，其他區段日誌都應出現突升。", comment: "除了朱諾邊個會咁寫", reply: "會測反例嘅人好多，專注證據" },
        ],
        noel: [
          { title: "地球直播聊天室變風向嘅瞬間", body: "主持人慢咗半拍，整片聊天室就變咗。反應順序比畫面重要。", comment: "原 PO係諾爾啦", reply: "睇反應嘅人多咗哈哈" },
          { title: "呢段肯定剪過，唔接受反駁", body: "換氣斷點太整齊。如果原直播唔係呢樣我就認。", comment: "原直播冇剪", reply: "標題寫得強，正文講嘅係可能" },
          { title: "佢講冇事之後嗰個眼神有冇睇到呀？", body: "講嘅話一樣，反應唔一樣。睇第二遍好明顯。", comment: "諾爾又盯緊反應", reply: "邊個都睇得出嚟，唔好召喚諾爾" },
        ],
      },
      posts: {
        mina: [
          { board: "偶像粉絲論壇", time: "三日前", title: "有冇睇到地球直播舞台截圖呀？", body: "用0.25倍速睇，最後嗰個笑係真係。我逐幀存咗，反駁請帶截圖。", meta: "12條留言 · 84次瀏覽", isHistory: false, comments: [{ author: "匿名1", text: "呢種截圖整理都太米娜啦哈哈", time: "三日前" }, { author: "原 PO", text: "唔好咩都講係米娜？？存截圖嘅人好多", time: "三日前", isAuthor: true }] },
          { board: "偶像粉絲論壇", time: "一個月前", title: "今晚圓頂場館演唱會絕對唔去", body: "預告剪輯已經令我頂唔順。就算有餘票都唔去。真係。", meta: "31條留言 · 206次瀏覽", isHistory: true, comments: [{ author: "匿名2", text: "三小時後發咗現場自拍嘅係邊個嚟㗎？", time: "一個月前" }, { author: "原 PO", text: "氣質像嘅另一個人，唔係我", time: "一個月前", isAuthor: true }] },
        ],
        juno: [
          { board: "開發技術論壇", time: "五日前", title: "懷疑淨化器前先檢查氧氣室感應器", body: "警報係事實，淨化器故障係結論。冇原始日誌就都仲係推測。", meta: "8條留言 · 63次瀏覽", isHistory: false, comments: [{ author: "匿名1", text: "呢句式完全係朱諾", time: "五日前" }, { author: "原 PO", text: "同一論壇寫法相似好正常。驗證觀點，唔好認人。", time: "五日前", isAuthor: true }] },
          { board: "開發技術論壇", time: "兩個月前", title: "唔係淨化器故障，日誌已確認", body: "更像感應器暫存問題，重啟應該可以解決。", meta: "19條留言 · 141次瀏覽", isHistory: true, comments: [{ author: "匿名3", text: "第二日唔係換了安全單元呀", time: "兩個月前" }, { author: "原 PO", text: "標題反映當時資料。仲有，原 PO 已經唔喺度。", time: "兩個月前", isAuthor: true }] },
        ],
        noel: [
          { board: "直播論壇", time: "尋日", title: "地球直播聊天室變風向嘅瞬間", body: "主持人聲音發抖前所有人都講冇事。嗰一刻聊天室反轉，反應順序比畫面幾有趣。", meta: "15條留言 · 119次瀏覽", isHistory: false, comments: [{ author: "匿名2", text: "呢種反應追蹤係諾爾拿手好戲", time: "尋日" }, { author: "原 PO", text: "睇反應嘅人多咗，唔好秒變偵探哈哈", time: "尋日", isAuthor: true }] },
          { board: "直播論壇", time: "三週前", title: "呢段100%剪過", body: "斷點太整齊。如果原始片段唔一樣我馬上認。", meta: "27條留言 · 244次瀏覽", isHistory: true, comments: [{ author: "匿名4", text: "原始片段出咗，原來冇剪哈哈", time: "三週前" }, { author: "原 PO", text: "100%係標題風格，正文寫嘅係可能。仲有，唔係諾爾。", time: "三週前", isAuthor: true }] },
        ],
      },
      denialReplies: { mina: ["點解所有截圖帖都當晒係米娜？？只係匿名咋", "攞出我去過嘅證據。唔係我哈哈"], juno: ["估作者前先驗證反例。", "帖文基於當時資料，但並非朱諾所寫。"], noel: ["口吻相似唔代表係同一個人哈哈", "大家都傾緊嗰段，唔好召喚諾爾。"] },
      genericReplies: { mina: ["我都有留意呢個。有原始資料就補上。", "呢個我明，但仲想睇其他嘅截圖。", "可能只係喜好唔同哈哈"], juno: ["存在呢種可能，都比較吓反例。", "就內容而言，呢係合理嘅質疑。", "如果有原始日誌，請更新帖文。"], noel: ["我睇到嗰個反應哈哈，時機好怪。", "我明呢個解讀，反應確實更早。", "睇過原始片段後判斷可能會變。"] },
    },
    level: { label: (level) => `Lv.${level}`, growthTitle: "好友升級", growthDetail: "下局，推理同反駁會更敏銳少少。" },
    difficulty: { eyebrow: "可選設定", title: "遊戲難度", names: { normal: "普通", hard: "困難" }, short: { normal: "普通", hard: "HARD" }, descriptions: { normal: "按而家等級遊玩", hard: "約6至7分鐘 · 無草稿 · 三回合質詢 · AI等級+20" }, current: (name) => `已選擇${name}模式 · 可隨時更改` },
    personalQuest: {
      title: "下局支線任務", inGameLabel: "個人支線任務", accept: "接受", later: "陣間", accepted: "已接受 · 下局生效", inProgress: "進行中", success: "支線任務完成", failure: "支線任務失敗", affinityGain: (score) => `親密度 +${score}`,
      names: { "mina-shift": "改變米娜嘅判斷", "juno-counterexample": "提出反例", "noel-consistency": "保持講法一致" }, goals: { "mina-shift": "令米娜由講謊前嘅判斷到最終投票之間改變票向。", "juno-counterexample": "用有力支持嘅指控攻擊你栽贓對象以外嘅人。", "noel-consistency": "維持最初目標，唔把反駁轉嫁畀其他人。" }, reactions: { mina: { success: "咦，真把我嘅票撬走咗哈哈，講到做到嘛。", failure: "我嘅判斷完全冇變哈哈，下次帶點其他嘅證據。" }, juno: { success: "冇只依賴一條線索，仲驗證咗反例。呢點我認可。", failure: "方向有可能，但證據鏈仲少一環。下次先驗證反例。" }, noel: { success: "由頭到尾同一個人。今次講法對得上哈哈。", failure: "最開始同中途換人咗啦。以為我睇唔出嚟？哈哈" } },
    },
    journal: {
      title: "偽裝職業調查日誌", progress: (count) => `已喺唔同日期完成${count}/5次`, next: (name) => `下一條線索：今日完成一局並同${name}複盤 · 每日一條，共五個唔同日期`, todayComplete: "今日嘅線索已獲得。請第二日再完成一局以繼續。", complete: "私家偵探調查完成", clueAwarded: "獲得今日線索", unlock: "解鎖偽裝職業：私家偵探", locked: "尚未解鎖嘅偽裝職業", groupName: "三個朋友", cluesOpen: "睇已收集線索", clueTitles: ["上鎖嘅剪影", "職業物品", "部分能力", "優勢同限制", "啲朋友嘅結論"],
      clueBodies: [(name) => `${name}喺保存紀錄入面發現長風衣嘅剪影。`, (name) => `${name}指出袖珍筆記本同用舊嘅放大鏡係下一條線索。`, (name) => `${name}推測呢個職業可以睇到某人而家懷疑嘅對象。`, (name, outcome, selected) => `${name}由上局“${outcome} · ${selected}”嘅結果判斷：佢可以提早獲取資訊，但之後嘅攻擊會受限制。`, () => "米娜、朱諾同諾爾合併咗線索。偽裝職業係私家偵探。"],
    },
    detective: { jobTitle: "偽裝職業 · 私家偵探", equip: "裝備私家偵探", playBasic: "唔使用偽裝職業", equipped: "今局已裝備", basic: "而家使用基礎狀態", abilityTitle: "私家偵探調查", abilityLead: "揭示一個人而家懷疑嘅對象，但你唔可以直接指控被調查者。", choose: "選擇一個人", inspect: (name) => `調查${name}`, revealed: (name, target) => `${name}而家懷疑${target}。`, blocked: "已調查 · 冇辦法直接指控", cannotAccuse: (name) => `${name}已被調查，今局冇辦法直接指控。` },
    friendChatFallback: "自動重連仍然失敗，本次回覆由離線模式生成。下一條信息會再次嘗試即時連線。",
    friendGreetings: { record: ["啊，你嚟咗哈哈，我啱啱整理截圖休息吓。", "啱啱好得閒。你頭先做緊咩？", "嚟咗喎。遊戲或閒聊都可以，我聽著。"], skeptic: ["嗨。唔使先有結論，隨便傾。", "我而家得閒。你諗緊咩？", "在線，聽緊呀。遊戲以外都可以傾哈哈。"], behavior: ["哦，嚟咗。時機唔錯哈哈，頭先做緊咩？", "估唔到你會私訊，不過我喺度。咩事？", "睇到你在線咗哈哈。今日狀態幾分？"] },
    selected: "✓ 已選擇", select: "選擇", stages: { evidence: "放置證據", facts: "確認事實", lie: "傾偈指控", challenge: "傾偈回覆", meetingEnd: "會議結束", result: "投票結果" }, incidentHappened: "案件發生", secretMessage: "私密信息 · 僅你可見", factMarks: { alibi: "監控", access: "工具", contradiction: "時間" }, evidenceMark: "證據", subquestLabel: "支線任務！", subquestOptional: "可選挑戰 · 失敗無懲罰", subquestSuccess: "支線任務完成！", subquestMissed: "支線任務失敗", subquestSuccessDetail: "目標完成。下局會出現新挑戰。", subquestMissedDetail: "唔影響主線結果。下局嘗試其他挑戰。",
    evidencePrompt: "要把呢張卡放進邊個嘅儲物櫃？", evidenceGroup: "要栽贓嘅隊員", plant: (name) => `栽贓${name}`, chooseOne: "選擇一個隊員", evidenceFound: "發現假證據", meetingTitle: (name) => `喺${name}嘅儲物櫃入面<br />搵到張門卡。`, roundFacts: "以下三項事實僅適用於今局。", publicFacts: "今局公開事實", clueCount: (count) => `${count}條線索`, openingStatements: "睇隊員開場發言", makeLie: "開啟遊戲房間傾偈", yourTurn: "到你", chatAccuseTitle: "用自己嘅話栽贓一個人。", chatAccuseLead: "輸入姓名同理由。快捷草稿為可選項，可自由修改。", chatHardAccuseLead: "請自行輸入姓名同理由。困難模式唔提供草稿。", chatReplyTitle: "親自回覆反駁。", chatReplyLead: "堅持指控、拉回被放置嘅卡，或要求重新核對紀錄。",
    hardTurn: (current, total) => `長會議 · 質詢 ${current}/${total}`, hardReplyTitles: ["回覆第一回合反駁。", "回覆全部三回合質詢。", "投票前陳述最終主張。"], hardReplyLeads: ["唔好忘記最初目標同公開事實。", "更換目標或同事實衝突會加深懷疑。", "發送呢條信息後立即開始投票。"], hardInterpreted: (target, claim, response) => `遊戲解析 · 目標 ${target} · 指控 ${claim} · 回覆 ${response}`, hardFinalSubmitted: "最終辯護已發送，即將開始投票。",
    hardPracticeChallenge: (personality, target, fact, changed, conflict, round) => { if (personality === "record") { if (conflict) return `等等。公開紀錄係“${fact}”，同你嘅指控對唔上。`; if (changed) return `紀錄中最初目標唔係呢個人，點解改成${target}？`; return `第${round}輪質詢已紀錄。再畀一個基於紀錄懷疑${target}嘅理由。`; } if (personality === "skeptic") { if (conflict) return "該指控同公開事實唔可以同時成立。先回覆反例。"; if (changed) return "如果更換目標，就講明之前嘅假設為何失效。"; return `仲需要一個可以排除${target}以外可能性嘅理由。`; } if (changed) return `最開始係其他人，而家又係${target}？呢個轉向好顯眼。`; if (conflict) return "公開事實已經否定你，你語氣仲未變。解釋吓。"; return `你一直懷疑${target}，唔好只靠語氣，攞出證據。`; },
    chatRoomTitle: "遊戲房間 #041", chatTranscriptAria: "黑手黨遊戲房間傾偈", chatSuggestions: "快捷草稿", chatSuggestionsHint: "插入後可自由修改", relationStrong: "強線索連結", relationWeak: "弱關聯", relationConflict: "同事實矛盾", chatInputLabel: "信息", chatPlaceholderAccuse: "例：諾爾動過淨化器，工具都可以證明。", chatPlaceholderReply: "例：再核對一次22:10前後嘅紀錄。", chatSend: "發送", chatLength: (count) => `最多${count}字`, chatTyping: "朋友而家睇…", chatTypingPerson: (name) => `${name}輸入緊…`, chatModeLive: "朋友即時回覆", chatModeMock: "離線練習回覆", chatFallback: "自動重連仍然失敗，今個回合已使用離線模式。下一條信息會再次嘗試即時連線。", chatYou: "你", chatYouMark: "我", chatNow: "啱啱", freeChat: "自由輸入", chatInterpretedLie: (target, claim) => `遊戲解析 · 目標 ${target} · 主要依據 ${claim}`, chatInterpretedResponse: (text) => `遊戲解析 · 主要回覆“${text}” · 其餘細節保留原文`,
    chatPracticeReaction: (personality, name, variant) => ({ record: [`按紀錄睇，而家${name}最可疑。`, `等等，時間線仍然指向${name}。`, `確認過，${name}嘅講法最唔符合紀錄。`], skeptic: [`只睇事實，${name}仍係最大嫌疑。`, `排除推測後，${name}仍然需要解釋。`, `其他可能都測過咗，仍然${name}。`], behavior: [`${name}嘅反應一直令我留意，而家就盯呢度。`, `大家睇到${name}頭先嗰個轉軚呀？`, `我選${name}。嗰個反應唔可以忽略。`] })[personality][variant % 3],
    chatPracticeDecision: (personality, name, variant) => ({ record: [`我選${name}，紀錄指向嗰度。`, `順著時間線，投票對象就係${name}。`, `已保存紀錄。我投${name}。`], skeptic: [`即使排除推測，${name}仍最可疑。`, `只留下確定事實，結果就係${name}。`, `反例都查過咗，${name}仍然最符合。`], behavior: [`${name}。最後嘅反應令我確定咗。`, `睇完最後回覆，我投${name}。`, `${name}嘅語氣變了好幾次，就投呢度。`] })[personality][variant % 3],
    friendPracticeReply: (personality, variant, message) => ({ record: [`“${message}”呢句我已經存低咗哈哈，再講點。`, `明白。“${message}”係你最想講嘅呀？`, `我整理緊。“${message}”最令我留意。`], skeptic: [`明白。“${message}”比較似係事實定係感受？`, `有呢種可能。你點解會得出“${message}”？`, `知道喇。想過其他解釋呀？`], behavior: [`你講“${message}”嘅語氣，一睇就有事哈哈`, `聽語氣，你比自己以為嘅更在意。`, `嗯，聽得出嚟你就係想傾呢樣。繼續。`] })[personality][variant % 3],
    audioStart: "播放背景音樂", audioMute: "背景音樂靜音", audioUnmute: "開啟背景音樂", audioVolume: "背景音樂音量", audioVoiceMuted: "語音通話期間背景音樂已靜音", debriefOpen: "睇賽後好友傾偈", debriefRequest: "三個人傾吓啱啱完嘅遊戲。", debriefTitle: "而家複盤上局", debriefLead: "啲朋友記得頭先嘅選擇同結果。", debriefSummary: "上局", debriefOutcome: { win: "勝利", lose: "身份暴露", draw: "平局" }, debriefNoSelection: "無人被選中", debriefRoundLine: (planted, accused, selected) => `你將假證據放咗喺${planted}，指控咗${accused}，最終${selected}被選中。`, debriefFallback: "自動重連仍然失敗，現顯示基於角色性格生成嘅離線對話。下一次請求會再次嘗試即時連線。", debriefHome: "主頁",
    debriefPractice: { record: (selected) => `最後票都流向${selected}嘅過程值得存檔哈哈`, skeptic: (accused) => `我理解懷疑${accused}嘅理由。下次都測吓反例。`, behavior: (outcome) => `“${outcome}”出嚟嗰刻氣氛都變咗哈哈，下局都幾期待。` }, chatDecisionTitle: "房間已經形成結論。", chatDecisionLead: "公開投票前，先睇傾偈中嘅懷疑如何變化。", yourResponse: "你嘅最終回覆", preVoteAria: "投票前各隊員嘅判斷", showVote: "公開投票結果", voteShiftAria: "講謊前後嘅判斷變化", beforeAfter: "講謊前 → 最終判斷", changed: "票向已改變", unchanged: "維持原判斷", resultAria: "隊員投票及理由", nextRoundTitle: "下局：新事實同支線任務", nextRoundDetail: "朋友唔變，但線索變化會帶來唔同反應。", restart: "使用新事實開始下局",
    result: {
      tiers: { mastermind: "完美誤導 · ★★★", manipulator: "操縱票向 · ★★", survivor: "避開懷疑 · ★" }, drawEyebrow: "投票無效", loseEyebrow: "身份暴露", drawTitle: "無人被淘汰。", winTitle: (name) => `${name}被淘汰`, loseTitle: "你被淘汰。", drawDescription: "三票分散。你保住了身份，但未能淘汰任何人。", shiftedDescription: (count) => `你嘅選擇帶動咗${count}票。`, safeDescription: "票向冇改變，但懷疑都冇集中到你身上。", loseDescription: "其他玩家發現咗你講法中嘅矛盾。", drawWhy: "點解投票無效？", shiftWhy: "咩改咗票向？", safeWhy: "點解避開咗懷疑？", loseWhy: "點解身份暴露？", drawExplanation: "三個人分別投畀唔同對象，冇任何人達到兩票多數。", loseExplanation: "你嘅指控同事實矛盾或多次改變，懷疑最終回到你身上。", redirectedExplanation: (name, count) => `你將票由被栽贓者引去${name}。最終判斷中有${count}項同講謊前唔同。`, safeExplanation: "被放置嘅門卡本身就製造了足夠懷疑，令你安全獲勝，冇新增票向變化。", shiftedExplanation: (count) => `被放置嘅卡同之後嘅講法改咗${count}項最終判斷。`, splitExplanation: "隊員判斷分散，但你以外嘅某人獲得了最高票。",
    },
  },
  friendRoom: {
    meta: {
      title: "MARS.NET · 朋友房", back: "返去單人首頁", language: "語言",
      themeControl: (name) => `畫面模式：${name}。撳一下轉換`,
      themes: { system: "自動", light: "淺色", dark: "深色" },
      audio: { start: "播放背景音樂", mute: "靜音背景音樂", unmute: "開返背景音樂", volume: "背景音樂音量" },
    },
    entry: {
      eyebrow: "二人即時遊戲", title: "同朋友玩返局黑手黨？", lead: "分享連結，同兩位火星居民朋友一齊玩。",
      create: "開房", join: "用代碼入房", code: "房間代碼", codePlaceholder: "6位代碼", name: "顯示名稱", namePlaceholder: "1至12個字", avatar: "內置頭像", submitCreate: "開房", submitJoin: "入房", privacy: "你上載嘅個人頭像唔會分享畀其他人。",
    },
    connection: { connected: "已連線", reconnecting: "重新連線緊…", disconnected: "斷咗線", expired: "間房已經過期。", end: "結束房間" },
    lobby: { eyebrow: "MARS.NET 私人房", title: "等朋友入嚟", code: "房間代碼", copy: "複製邀請連結", copied: "複製咗", ready: "準備好", cancelReady: "取消準備", waiting: "等緊第二位玩家…", player: "真人玩家", character: "MARS.NET 火星居民", rotation: "兩位火星居民朋友每局都會輪換。" },
    role: { eyebrow: "淨係你睇到嘅秘密身份", mafia: "你係黑手黨。", citizen: "你係平民。", mafiaLead: "用假證據同聊天，令另一位參加者拎到兩票。", citizenLead: "睇聊天同公開事實，搵出黑手黨。你最後嘅選擇計一票。", confirm: "確認身份", wait: "等緊對方確認身份…" },
    plant: { title: "擺低假證據。", lead: "揀一個儲物櫃，放入整爛咗嘅門禁卡。", wait: "黑手黨準備緊單嘢…", action: (name) => `栽贓${name}` },
    facts: { eyebrow: "公開事實", title: "火星標準時間22:10 · 氧氣室", lead: "淨化器安全裝置壞咗。喺聊天度搵出邊個講大話。", confirm: "確認事實並開聊天", wait: "等緊對方確認事實…" },
    chat: { title: "即時推理聊天", lead: "兩位真人玩家講嘅嘢會影響實際懷疑判斷。", placeholder: "講下你懷疑邊個，同埋點解", send: "發送", typing: (name) => `${name}輸入緊…`, voteTitle: "平民最後投票", voteLead: "你嗰一票會同兩位火星居民嘅票一齊計。", vote: (name) => `投${name}一票`, mafiaWait: "平民揀緊最後一票。", emoji: "表情符號" },
    result: {
      mafiaWin: "黑手黨贏咗", mafiaLoss: "平民贏咗", draw: "投票作廢", selected: (name) => `${name}拎到最少兩票。`, drawLead: "票數分成1–1–1，冇人出局。", roles: "公開身份", votes: "最後投票", reasonManual: "真人平民直接揀嘅一票", reasonEvidence: "公開事實同驗證過嘅聊天一齊判斷",
      reactions: {
        mafia_win: { mina: "頭先嗰下票數轉向我截咗圖，呢局真係要認你叻。", juno: "聊天走向蓋過咗假證據。下局先驗反例。", noel: "見唔見到最後個氣氛點樣反轉？時機捉得幾準。" },
        mafia_loss: { mina: "你個講法同紀錄對唔上嗰下，我即刻睇到。下局記得兜圓啲。", juno: "有個主張同公開事實撞咗。下次驗證完整個假設。", noel: "你中途個反應變咗，好明顯。下局由頭到尾講一致啲。" },
        draw: { mina: "三票全部分開都得，呢局一定要存低。", juno: "證據指向三邊，結論企唔住。值得再玩一局。", noel: "到最後成間房都未定到。再玩一局應該睇得出。" },
      },
      rematch: "交換身份再玩", rematchWaiting: "等緊對方準備再玩…",
    },
    errors: { generic: "處理唔到呢個要求。", stale_event: "房間狀態變咗，已經恢復最新狀態。", rapid_duplicate: "唔可以即刻重複發送同一段信息。", room_expired: "間房已經過期。", room_full: "呢間房已經滿咗。", invalid_locale: "暫時唔支援呢種語言。" },
  },
  account: {
    guest: "訪客 · 儲存喺呢部裝置", signedIn: "儲存緊去雲端", saved: "已儲存去雲端", syncing: "同步緊", pending: "等緊同步",
    saveTitle: "將紀錄儲存去帳戶", saveLead: "登入之後，可以喺其他裝置繼續成長進度、對局紀錄同私人聊天。", saveAction: "登入並儲存紀錄",
    accountTitle: "MARS.NET 帳戶", loginLead: "你仍然可以用訪客身份玩。登入之後會安全合併呢部裝置嘅紀錄。", google: "用Google繼續", email: "用電郵繼續", guestAction: "以訪客身份開始",
    authEyebrow: "2050 · MARS.NET", authTitle: "朋友喺火星等緊你", authLead: "登入延續紀錄，或者直接用訪客身份開始。", authLoading: "檢查緊帳戶連線…", guestNote: "唔使註冊就可以開始。進度會儲存喺呢部裝置。",
    privacyPolicy: "私隱政策", termsOfService: "服務條款", emailLoginTitle: "用電郵登入", emailSignupTitle: "建立MARS.NET帳戶", emailResetTitle: "重設密碼", recoveryTitle: "設定新密碼",
    emailLabel: "電郵", passwordLabel: "密碼", passwordConfirmLabel: "確認密碼", passwordHint: "請輸入最少8個字元。", emailPlaceholder: "you@example.com",
    loginAction: "登入", signupAction: "建立帳戶", resetAction: "發送重設電郵", updatePasswordAction: "儲存新密碼", forgotPassword: "唔記得密碼？", createAccount: "第一次嚟？建立帳戶", existingAccount: "已經有帳戶？登入", back: "返回",
    confirmationSent: "驗證電郵已經寄出。完成驗證之後請登入。", resetSent: "如果呢個地址已登記，重設電郵就會寄到你嘅信箱。", passwordUpdated: "密碼已更新。", invalidEmail: "請輸入有效嘅電郵地址。", passwordMismatch: "兩次輸入嘅密碼唔一致。", authError: "請檢查登入資料，或者遲啲再試。",
    providerGoogle: "Google", providerEmail: "電郵", unavailable: "雲端儲存仲未設定。遊戲仍然會儲存喺呢部裝置。", connected: "已連接嘅登入方式", lastSync: "上次同步", never: "未有", export: "將所有紀錄匯出做JSON", deleteChats: "按角色刪除聊天", deleteChat: (name) => `刪除同${name}嘅聊天`, logout: "登出", deleteAccount: "刪除帳戶同雲端紀錄", feedback: "向製作者發送意見或問題", close: "關閉帳戶視窗",
    confirmChatDelete: "刪除同呢個角色嘅所有已儲存聊天？呢個操作冇得還原。", confirmAccountDelete: "刪除帳戶、成長紀錄、對局紀錄、私人聊天同頭像？呢個操作冇得還原。", reauth: "為咗安全，請重新登入之後先刪除帳戶。", error: "雲端連線失敗。你仍然可以繼續喺本機玩。",
    characters: { mina: "米娜", juno: "朱諾", noel: "諾爾" },
  },
};

let staging = globalThis[STAGING_KEY];
if (!staging) {
  staging = new Map();
  globalThis[STAGING_KEY] = staging;
}
staging.set("yue-Hant-HK", { schemaVersion: PACK_SCHEMA_VERSION, version: PACK_VERSION, pack });

export default pack;
