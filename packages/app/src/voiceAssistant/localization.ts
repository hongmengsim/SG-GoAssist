import type { AssistantLocale } from "./types";

export const defaultAssistantLocale: AssistantLocale = "en-SG";

export function normalizeAssistantLocale(
  value?: string | null,
): AssistantLocale {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized.startsWith("zh")) return "zh-SG";
  if (normalized.startsWith("ms") || normalized.startsWith("may")) {
    return "ms-SG";
  }
  if (normalized.startsWith("ta")) return "ta-SG";
  return defaultAssistantLocale;
}

export const assistantLocaleLabels: Record<AssistantLocale, string> = {
  "en-SG": "English",
  "zh-SG": "中文",
  "ms-SG": "Bahasa Melayu",
  "ta-SG": "தமிழ்",
};

const english = {
  statusReady: "Private assistant ready",
  statusLoading: "Preparing assistant",
  statusBasic: "Basic assistant available",
  talk: "Talk to GoAssist",
  type: "Type to GoAssist",
  stopListening: "Stop listening",
  listening: "Listening — speak now",
  preparingSpeech: "Preparing microphone…",
  finalisingSpeech: "Finishing recognition…",
  thinking: "Thinking…",
  speaking: "GoAssist is speaking…",
  retry: "Try Talk to GoAssist again",
  listeningHelp: "Speak now. Listening for up to {seconds} seconds.",
  preparingSpeechHelp: "Wait for Listening before you speak.",
  finalisingSpeechHelp: "Your words were heard. Preparing the request.",
  idleHelp: "Ask about your bus, journey, directions, or accessibility help.",
  retryHelp: "Press Talk, then speak when Listening appears.",
  speechVendorNotice: "Device speech services may need a connection.",
  unsupportedSpeech:
    "Speech recognition is unavailable. Type your request instead.",
  speechPermissionError:
    "Allow microphone access to speak, or type your request below.",
  speechSilenceError:
    "I couldn’t hear speech. Try again and wait for Listening, or type below.",
  speechServiceError:
    "The device speech service is unavailable. Type your request below.",
  speechTimeoutError:
    "Listening ended after 15 seconds. Try again or type your request below.",
  speechLanguageError:
    "Speech is unavailable for this language. Type your request below.",
  processingError: "I couldn’t process that request. Try again.",
  typeInstead: "Type instead",
  askPlaceholder: "Ask GoAssist…",
  send: "Send to GoAssist",
  you: "You",
  assistant: "GoAssist",
  sourceLive: "Live journey",
  sourceGuide: "GoAssist travel guide",
  shareExchange: "Share this exchange",
  diagnosticsHint:
    "Review a redacted copy before anything is shared. Audio is never included.",
  diagnosticsOn: "Optional diagnostics on",
  diagnosticsOff: "Optional diagnostics off",
  diagnosticsToggleHint:
    "When enabled, you may review and share an individual failed exchange. Nothing is sent automatically.",
  statusBasicDetail:
    "Journey commands and verified guides still work without the private model.",
  retryAssistant: "Retry private assistant",
  helpfulQuestion: "Was this helpful?",
  helpfulYes: "Yes",
  helpfulNo: "No",
  askOperator: "Ask an operator",
  operatorHint: "Requests help from a person after you confirm.",
  operatorCommand: "Ask an operator for help",
  genericClarification:
    "I’m not sure I understood. Do you want help with your bus, journey, directions, or accessibility assistance?",
  unsupportedAnswer:
    "I don’t have verified information for that yet. Ask about your current journey or accessibility assistance.",
  inputTooLong:
    "That request is too long. Please ask one short journey question at a time.",
  knowledgeClarification:
    "I found more than one possible guide. Please ask about one feature or journey step at a time.",
  shelterPlanRequired:
    "Plan a journey first, then I can compare verified shelter coverage.",
  shelterFullRoutes: "Fully sheltered: {routes}.",
  shelterPartialRoutes:
    "Partly sheltered: {routes}. Some walking sections may be uncovered.",
  shelterUnverified:
    "Shelter coverage isn’t verified for the current routes, so I can’t reliably identify a sheltered route yet.",
  stopKnown: "You’re near {description} bus stop, Stop {stop}.",
  stopUnknown: "Your current bus stop is not confirmed yet.",
  noBusDetected: "No bus is currently detected at your stop.",
  busesDetected: "{services} are currently detected at this stop.",
  busAtStop: "Service {service} is currently at your stop.",
  busArriving: "Service {service} appears to be arriving.",
  selectedBus: "You’re waiting for Service {service}.",
  noSelectedBus: "You don’t have a bus selected yet.",
  arrivalUnavailable: "Live arrival information for Service {service} is unavailable right now.",
  arrivalNow: "Service {service} is arriving now.",
  arrivalMinutes: "Service {service} is expected in about {minutes} {unit}.",
  arrivalMinutesSimple: "Service {service}. About {minutes} {unit}.",
  nextStop: "Your next stop is {stop}.",
  nextStopUnavailable: "The next stop is unavailable right now.",
  nextStopAfterStart: "Your next stop will be available after your journey starts.",
  stopsUnavailable: "The number of stops remaining is unavailable right now.",
  destinationHere: "This is your destination, {destination}.",
  destinationNext: "{destination} is your next stop.",
  stopsAway: "Your destination, {destination}, is {count} stops away.",
  destinationKnown: "You’re getting off at {destination}.",
  destinationUnknown: "You haven’t selected where to get off yet.",
  helpWalking: "You can ask me to repeat the directions or stop guidance.",
  helpOnboard: "You can ask for your next stop, destination, or help getting off.",
  helpJourney: "You can ask when your bus is arriving or request ramp assistance.",
  helpAtStop: "You can ask me what bus is here or request boarding assistance.",
  helpDiscovery: "You can ask where you are, what bus is here, or choose a stop and ask for directions.",
} as const;

export type AssistantCopyKey = keyof typeof english;

const catalog: Record<AssistantLocale, Record<AssistantCopyKey, string>> = {
  "en-SG": english,
  "zh-SG": {
    statusReady: "私人助理已就绪",
    statusLoading: "正在准备助理",
    statusBasic: "基本助理可用",
    talk: "与 GoAssist 对话",
    type: "输入问题给 GoAssist",
    stopListening: "停止聆听",
    listening: "正在聆听——请说话",
    preparingSpeech: "正在准备麦克风…",
    finalisingSpeech: "正在完成语音识别…",
    thinking: "正在思考…",
    speaking: "GoAssist 正在说话…",
    retry: "再次与 GoAssist 对话",
    listeningHelp: "请现在说话。聆听时间最长为 {seconds} 秒。",
    preparingSpeechHelp: "请等到显示“正在聆听”后再说话。",
    finalisingSpeechHelp: "已听到您的话，正在准备请求。",
    idleHelp: "询问巴士、行程、路线或无障碍协助。",
    retryHelp: "按下对话按钮，看到“正在聆听”后再说话。",
    speechVendorNotice: "设备语音服务可能需要网络连接。",
    unsupportedSpeech: "语音识别不可用。请改用文字输入。",
    speechPermissionError: "请允许麦克风权限，或在下方输入请求。",
    speechSilenceError: "未听到语音。请等到显示“正在聆听”后重试，或在下方输入。",
    speechServiceError: "设备语音服务不可用。请在下方输入请求。",
    speechTimeoutError: "聆听已在 15 秒后结束。请重试或在下方输入请求。",
    speechLanguageError: "此语言暂不支持语音。请在下方输入请求。",
    processingError: "无法处理该请求。请重试。",
    typeInstead: "改用文字",
    askPlaceholder: "询问 GoAssist…",
    send: "发送给 GoAssist",
    you: "您",
    assistant: "GoAssist",
    sourceLive: "实时行程",
    sourceGuide: "GoAssist 出行指南",
    shareExchange: "分享此次对话",
    diagnosticsHint: "分享前可查看已删减的副本，绝不会包含录音。",
    diagnosticsOn: "可选诊断已开启",
    diagnosticsOff: "可选诊断已关闭",
    diagnosticsToggleHint:
      "开启后，您可以查看并分享单次失败对话。系统不会自动发送任何内容。",
    statusBasicDetail: "即使私人模型不可用，行程指令和已验证指南仍可使用。",
    retryAssistant: "重试私人助理",
    helpfulQuestion: "这有帮助吗？",
    helpfulYes: "有",
    helpfulNo: "没有",
    askOperator: "联系人工操作员",
    operatorHint: "确认后向工作人员请求帮助。",
    operatorCommand: "请求人工操作员帮助",
    genericClarification: "我不太确定。您需要巴士、行程、路线还是无障碍协助？",
    unsupportedAnswer:
      "目前没有经过验证的相关资料。您可以询问当前行程或无障碍协助。",
    inputTooLong: "该请求太长。请每次只询问一个简短的行程问题。",
    knowledgeClarification: "我找到多个可能的指南。请每次只询问一个功能或行程步骤。",
    shelterPlanRequired: "请先规划行程，然后我可以比较已验证的遮蔽覆盖。",
    shelterFullRoutes: "全程有盖路线：{routes}。",
    shelterPartialRoutes: "部分有盖路线：{routes}。部分步行路段可能没有遮蔽。",
    shelterUnverified: "当前路线的遮蔽覆盖尚未验证，因此我暂时无法可靠判断哪条路线有盖。",
    stopKnown: "您在 {description} 巴士站附近，站号 {stop}。",
    stopUnknown: "您的当前巴士站尚未确认。",
    noBusDetected: "目前未在您的车站检测到巴士。",
    busesDetected: "目前在此车站检测到：{services}。",
    busAtStop: "{service} 号服务目前在您的车站。",
    busArriving: "{service} 号服务似乎正在抵达。",
    selectedBus: "您正在等候 {service} 号服务。",
    noSelectedBus: "您尚未选择巴士。",
    arrivalUnavailable: "目前无法取得 {service} 号服务的实时抵达资料。",
    arrivalNow: "{service} 号服务即将抵达。",
    arrivalMinutes: "{service} 号服务预计约 {minutes} 分钟后抵达。",
    arrivalMinutesSimple: "{service} 号服务，约 {minutes} 分钟。",
    nextStop: "下一站是 {stop}。",
    nextStopUnavailable: "目前无法取得下一站资料。",
    nextStopAfterStart: "行程开始后将显示下一站。",
    stopsUnavailable: "目前无法取得剩余站数。",
    destinationHere: "这里就是您的目的地：{destination}。",
    destinationNext: "下一站是您的目的地：{destination}。",
    stopsAway: "距离目的地 {destination} 还有 {count} 站。",
    destinationKnown: "您将在 {destination} 下车。",
    destinationUnknown: "您尚未选择下车地点。",
    helpWalking: "您可以要求重复路线或停止导航。",
    helpOnboard: "您可以询问下一站、目的地或请求下车协助。",
    helpJourney: "您可以询问巴士抵达时间或请求斜坡板协助。",
    helpAtStop: "您可以询问这里有什么巴士或请求登车协助。",
    helpDiscovery: "您可以询问所在位置、这里有什么巴士，或选择车站后请求路线。",
  },
  "ms-SG": {
    statusReady: "Pembantu peribadi sedia",
    statusLoading: "Sedang menyediakan pembantu",
    statusBasic: "Pembantu asas tersedia",
    talk: "Bercakap dengan GoAssist",
    type: "Taip kepada GoAssist",
    stopListening: "Berhenti mendengar",
    listening: "Sedang mendengar — sila bercakap",
    preparingSpeech: "Menyediakan mikrofon…",
    finalisingSpeech: "Menyelesaikan pengecaman…",
    thinking: "Sedang berfikir…",
    speaking: "GoAssist sedang bercakap…",
    retry: "Cuba bercakap dengan GoAssist lagi",
    listeningHelp: "Bercakap sekarang. Mendengar sehingga {seconds} saat.",
    preparingSpeechHelp: "Tunggu sehingga Mendengar dipaparkan sebelum bercakap.",
    finalisingSpeechHelp: "Kata-kata anda telah didengar. Menyediakan permintaan.",
    idleHelp: "Tanya tentang bas, perjalanan, arah atau bantuan aksesibiliti.",
    retryHelp:
      "Tekan Bercakap, kemudian bercakap apabila Mendengar dipaparkan.",
    speechVendorNotice:
      "Perkhidmatan suara peranti mungkin memerlukan sambungan.",
    unsupportedSpeech: "Pengecaman suara tidak tersedia. Taip permintaan anda.",
    speechPermissionError: "Benarkan mikrofon untuk bercakap, atau taip permintaan di bawah.",
    speechSilenceError: "Tiada pertuturan didengar. Cuba lagi selepas Mendengar dipaparkan, atau taip di bawah.",
    speechServiceError: "Perkhidmatan suara peranti tidak tersedia. Taip permintaan di bawah.",
    speechTimeoutError: "Pendengaran tamat selepas 15 saat. Cuba lagi atau taip permintaan anda.",
    speechLanguageError: "Suara tidak tersedia untuk bahasa ini. Taip permintaan anda.",
    processingError: "Permintaan itu tidak dapat diproses. Cuba lagi.",
    typeInstead: "Taip sahaja",
    askPlaceholder: "Tanya GoAssist…",
    send: "Hantar kepada GoAssist",
    you: "Anda",
    assistant: "GoAssist",
    sourceLive: "Perjalanan langsung",
    sourceGuide: "Panduan perjalanan GoAssist",
    shareExchange: "Kongsi perbualan ini",
    diagnosticsHint:
      "Semak salinan yang telah disunting sebelum dikongsi. Audio tidak disertakan.",
    diagnosticsOn: "Diagnostik pilihan dihidupkan",
    diagnosticsOff: "Diagnostik pilihan dimatikan",
    diagnosticsToggleHint:
      "Apabila dihidupkan, anda boleh menyemak dan berkongsi satu perbualan yang gagal. Tiada apa dihantar secara automatik.",
    statusBasicDetail: "Arahan perjalanan dan panduan disahkan masih berfungsi tanpa model peribadi.",
    retryAssistant: "Cuba semula pembantu peribadi",
    helpfulQuestion: "Adakah ini membantu?",
    helpfulYes: "Ya",
    helpfulNo: "Tidak",
    askOperator: "Minta bantuan operator",
    operatorHint: "Meminta bantuan manusia selepas anda mengesahkan.",
    operatorCommand: "Minta bantuan operator",
    genericClarification:
      "Saya kurang pasti. Adakah anda perlukan bantuan bas, perjalanan, arah atau aksesibiliti?",
    unsupportedAnswer:
      "Saya belum mempunyai maklumat yang disahkan. Tanya tentang perjalanan semasa atau bantuan aksesibiliti.",
    inputTooLong:
      "Permintaan itu terlalu panjang. Tanya satu soalan perjalanan ringkas pada satu masa.",
    knowledgeClarification:
      "Saya menemui lebih daripada satu panduan. Tanya tentang satu ciri atau langkah perjalanan pada satu masa.",
    shelterPlanRequired:
      "Rancang perjalanan dahulu, kemudian saya boleh membandingkan liputan berbumbung yang telah disahkan.",
    shelterFullRoutes: "Berbumbung sepenuhnya: {routes}.",
    shelterPartialRoutes:
      "Berbumbung sebahagian: {routes}. Sesetengah bahagian berjalan mungkin tidak berbumbung.",
    shelterUnverified:
      "Liputan berbumbung belum disahkan untuk laluan semasa, jadi saya belum dapat mengenal pasti laluan berbumbung dengan tepat.",
    stopKnown: "Anda berdekatan perhentian bas {description}, Hentian {stop}.",
    stopUnknown: "Perhentian bas semasa anda belum disahkan.",
    noBusDetected: "Tiada bas dikesan di perhentian anda sekarang.",
    busesDetected: "{services} dikesan di perhentian ini sekarang.",
    busAtStop: "Perkhidmatan {service} berada di perhentian anda sekarang.",
    busArriving: "Perkhidmatan {service} nampaknya sedang tiba.",
    selectedBus: "Anda sedang menunggu Perkhidmatan {service}.",
    noSelectedBus: "Anda belum memilih bas.",
    arrivalUnavailable: "Maklumat ketibaan langsung Perkhidmatan {service} tidak tersedia sekarang.",
    arrivalNow: "Perkhidmatan {service} sedang tiba sekarang.",
    arrivalMinutes: "Perkhidmatan {service} dijangka tiba dalam kira-kira {minutes} minit.",
    arrivalMinutesSimple: "Perkhidmatan {service}. Kira-kira {minutes} minit.",
    nextStop: "Hentian seterusnya ialah {stop}.",
    nextStopUnavailable: "Hentian seterusnya tidak tersedia sekarang.",
    nextStopAfterStart: "Hentian seterusnya akan tersedia selepas perjalanan bermula.",
    stopsUnavailable: "Bilangan hentian yang tinggal tidak tersedia sekarang.",
    destinationHere: "Ini destinasi anda, {destination}.",
    destinationNext: "{destination} ialah hentian seterusnya.",
    stopsAway: "Destinasi anda, {destination}, tinggal {count} hentian.",
    destinationKnown: "Anda akan turun di {destination}.",
    destinationUnknown: "Anda belum memilih tempat untuk turun.",
    helpWalking: "Anda boleh meminta saya mengulang arah atau menghentikan panduan.",
    helpOnboard: "Anda boleh bertanya hentian seterusnya, destinasi atau bantuan turun.",
    helpJourney: "Anda boleh bertanya waktu bas tiba atau meminta bantuan tanjakan.",
    helpAtStop: "Anda boleh bertanya bas apa yang ada atau meminta bantuan menaiki bas.",
    helpDiscovery: "Anda boleh bertanya lokasi anda, bas yang ada, atau memilih hentian dan meminta arah.",
  },
  "ta-SG": {
    statusReady: "தனிப்பட்ட உதவியாளர் தயார்",
    statusLoading: "உதவியாளர் தயாராகிறது",
    statusBasic: "அடிப்படை உதவியாளர் கிடைக்கிறது",
    talk: "GoAssist உடன் பேசுங்கள்",
    type: "GoAssist-க்கு தட்டச்சு செய்யுங்கள்",
    stopListening: "கேட்பதை நிறுத்து",
    listening: "கேட்கிறது — இப்போது பேசுங்கள்",
    preparingSpeech: "ஒலிவாங்கி தயாராகிறது…",
    finalisingSpeech: "குரல் அறிதல் முடிகிறது…",
    thinking: "சிந்திக்கிறது…",
    speaking: "GoAssist பேசுகிறது…",
    retry: "GoAssist உடன் மீண்டும் பேசுங்கள்",
    listeningHelp: "இப்போது பேசுங்கள். {seconds} விநாடிகள் வரை கேட்கும்.",
    preparingSpeechHelp: "கேட்கிறது என்று காட்டிய பிறகு பேசுங்கள்.",
    finalisingSpeechHelp: "உங்கள் சொற்கள் கேட்கப்பட்டன. கோரிக்கை தயாராகிறது.",
    idleHelp: "பேருந்து, பயணம், வழி அல்லது அணுகல்தன்மை உதவி பற்றி கேளுங்கள்.",
    retryHelp: "பேசு பொத்தானை அழுத்தி, கேட்கிறது எனத் தோன்றியதும் பேசுங்கள்.",
    speechVendorNotice: "சாதன குரல் சேவைக்கு இணைய இணைப்பு தேவைப்படலாம்.",
    unsupportedSpeech:
      "குரல் அறிதல் கிடைக்கவில்லை. உங்கள் கோரிக்கையை தட்டச்சு செய்யுங்கள்.",
    speechPermissionError: "பேச ஒலிவாங்கி அனுமதி வழங்குங்கள், அல்லது கீழே தட்டச்சு செய்யுங்கள்.",
    speechSilenceError: "பேச்சு கேட்கவில்லை. கேட்கிறது என்று காட்டிய பிறகு முயலுங்கள், அல்லது கீழே தட்டச்சு செய்யுங்கள்.",
    speechServiceError: "சாதன குரல் சேவை கிடைக்கவில்லை. கீழே தட்டச்சு செய்யுங்கள்.",
    speechTimeoutError: "15 விநாடிகளுக்குப் பிறகு கேட்பது முடிந்தது. மீண்டும் முயலுங்கள் அல்லது தட்டச்சு செய்யுங்கள்.",
    speechLanguageError: "இந்த மொழிக்குக் குரல் கிடைக்கவில்லை. கீழே தட்டச்சு செய்யுங்கள்.",
    processingError:
      "அந்த கோரிக்கையைச் செயல்படுத்த முடியவில்லை. மீண்டும் முயலுங்கள்.",
    typeInstead: "தட்டச்சு செய்",
    askPlaceholder: "GoAssist-ஐ கேளுங்கள்…",
    send: "GoAssist-க்கு அனுப்பு",
    you: "நீங்கள்",
    assistant: "GoAssist",
    sourceLive: "நேரடி பயணம்",
    sourceGuide: "GoAssist பயண வழிகாட்டி",
    shareExchange: "இந்த உரையாடலைப் பகிர்",
    diagnosticsHint:
      "பகிர்வதற்கு முன் மறைக்கப்பட்ட நகலைப் பாருங்கள். ஒலி ஒருபோதும் சேர்க்கப்படாது.",
    diagnosticsOn: "விருப்ப கண்டறிதல் இயக்கப்பட்டது",
    diagnosticsOff: "விருப்ப கண்டறிதல் முடக்கப்பட்டது",
    diagnosticsToggleHint:
      "இயக்கப்பட்டால், தோல்வியடைந்த ஒரு உரையாடலைப் பார்த்து பகிரலாம். எதுவும் தானாக அனுப்பப்படாது.",
    statusBasicDetail: "தனிப்பட்ட மாதிரி இல்லாமலும் பயணக் கட்டளைகளும் சரிபார்க்கப்பட்ட வழிகாட்டிகளும் செயல்படும்.",
    retryAssistant: "தனிப்பட்ட உதவியாளரை மீண்டும் முயற்சி செய்",
    helpfulQuestion: "இது உதவியதா?",
    helpfulYes: "ஆம்",
    helpfulNo: "இல்லை",
    askOperator: "இயக்குநரிடம் கேள்",
    operatorHint: "நீங்கள் உறுதிப்படுத்திய பிறகு மனித உதவியைக் கோரும்.",
    operatorCommand: "இயக்குநரிடம் உதவி கேள்",
    genericClarification:
      "எனக்கு உறுதியாகப் புரியவில்லை. பேருந்து, பயணம், வழி அல்லது அணுகல்தன்மை உதவி வேண்டுமா?",
    unsupportedAnswer:
      "அதற்கான சரிபார்க்கப்பட்ட தகவல் இன்னும் இல்லை. தற்போதைய பயணம் அல்லது அணுகல்தன்மை உதவி பற்றி கேளுங்கள்.",
    inputTooLong:
      "அந்தக் கோரிக்கை மிக நீளமாக உள்ளது. ஒரே நேரத்தில் ஒரு குறுகிய பயணக் கேள்வியைக் கேளுங்கள்.",
    knowledgeClarification:
      "ஒன்றுக்கு மேற்பட்ட வழிகாட்டிகள் கிடைத்தன. ஒரே நேரத்தில் ஒரு அம்சம் அல்லது பயணப் படியைப் பற்றி கேளுங்கள்.",
    shelterPlanRequired:
      "முதலில் ஒரு பயணத்தைத் திட்டமிடுங்கள்; பிறகு சரிபார்க்கப்பட்ட கூரைப் பாதுகாப்பை ஒப்பிட முடியும்.",
    shelterFullRoutes: "முழுமையாக கூரையுள்ள வழிகள்: {routes}.",
    shelterPartialRoutes:
      "பகுதியாக கூரையுள்ள வழிகள்: {routes}. சில நடைப்பகுதிகள் திறந்தவையாக இருக்கலாம்.",
    shelterUnverified:
      "தற்போதைய வழிகளுக்கான கூரைப் பாதுகாப்பு சரிபார்க்கப்படவில்லை; எனவே எந்த வழி கூரையுள்ளது என்பதை நம்பகமாகக் கூற முடியாது.",
    stopKnown: "நீங்கள் {description} பேருந்து நிறுத்தம், நிறுத்தம் {stop} அருகில் உள்ளீர்கள்.",
    stopUnknown: "உங்கள் தற்போதைய பேருந்து நிறுத்தம் இன்னும் உறுதிப்படுத்தப்படவில்லை.",
    noBusDetected: "உங்கள் நிறுத்தத்தில் தற்போது பேருந்து எதுவும் கண்டறியப்படவில்லை.",
    busesDetected: "இந்த நிறுத்தத்தில் தற்போது {services} கண்டறியப்பட்டுள்ளன.",
    busAtStop: "சேவை {service} தற்போது உங்கள் நிறுத்தத்தில் உள்ளது.",
    busArriving: "சேவை {service} வந்துகொண்டிருக்கிறது.",
    selectedBus: "நீங்கள் சேவை {service}-க்காகக் காத்திருக்கிறீர்கள்.",
    noSelectedBus: "நீங்கள் இன்னும் பேருந்தைத் தேர்ந்தெடுக்கவில்லை.",
    arrivalUnavailable: "சேவை {service}-ன் நேரடி வருகை தகவல் தற்போது கிடைக்கவில்லை.",
    arrivalNow: "சேவை {service} இப்போது வருகிறது.",
    arrivalMinutes: "சேவை {service} சுமார் {minutes} நிமிடங்களில் வரும்.",
    arrivalMinutesSimple: "சேவை {service}. சுமார் {minutes} நிமிடங்கள்.",
    nextStop: "அடுத்த நிறுத்தம் {stop}.",
    nextStopUnavailable: "அடுத்த நிறுத்தம் தற்போது கிடைக்கவில்லை.",
    nextStopAfterStart: "பயணம் தொடங்கிய பிறகு அடுத்த நிறுத்தம் கிடைக்கும்.",
    stopsUnavailable: "மீதமுள்ள நிறுத்தங்களின் எண்ணிக்கை தற்போது கிடைக்கவில்லை.",
    destinationHere: "இது உங்கள் இலக்கு, {destination}.",
    destinationNext: "{destination} உங்கள் அடுத்த நிறுத்தம்.",
    stopsAway: "உங்கள் இலக்கு {destination} இன்னும் {count} நிறுத்தங்கள் தொலைவில் உள்ளது.",
    destinationKnown: "நீங்கள் {destination}-இல் இறங்குவீர்கள்.",
    destinationUnknown: "எங்கே இறங்க வேண்டும் என்பதை இன்னும் தேர்ந்தெடுக்கவில்லை.",
    helpWalking: "வழியை மீண்டும் சொல்லவோ வழிகாட்டலை நிறுத்தவோ கேட்கலாம்.",
    helpOnboard: "அடுத்த நிறுத்தம், இலக்கு அல்லது இறங்கும் உதவியைக் கேட்கலாம்.",
    helpJourney: "பேருந்து வருகை நேரம் அல்லது சாய்வுப்பாதை உதவியைக் கேட்கலாம்.",
    helpAtStop: "இங்கே எந்த பேருந்து உள்ளது அல்லது ஏறும் உதவி பற்றி கேட்கலாம்.",
    helpDiscovery: "நீங்கள் எங்கே உள்ளீர்கள், இங்கே எந்த பேருந்து உள்ளது, அல்லது நிறுத்தத்தைத் தேர்ந்தெடுத்து வழி கேட்கலாம்.",
  },
};

export function assistantCopy(
  locale: AssistantLocale | undefined,
  key: AssistantCopyKey,
  variables: Record<string, string | number> = {},
) {
  const template = catalog[locale ?? defaultAssistantLocale][key];
  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    String(variables[name] ?? `{${name}}`),
  );
}

const safetyEnglish = {
  confirmationExpired:
    "That confirmation expired. Please ask me to perform the action again.",
  confirmationContextChanged:
    "Your journey context changed, so I did not perform that action. Please ask again.",
  assistanceCancelled: "Okay. I won’t send an assistance request.",
  actionCancelled: "Okay. I cancelled that action.",
  sayService: "Please say the service number. {services}.",
  rampConfirmation: "Request ramp assistance for Service {service}?",
  extraTimeConfirmation: "Request more boarding time for Service {service}?",
  onboardBoardingBlocked:
    "You’re already onboard. You can ask me for help getting off the bus.",
  stopUnconfirmed:
    "I can’t send that request because your current bus stop isn’t confirmed.",
  serviceUnconfirmed:
    "I can’t confirm Service {service} at this stop. No request was sent.",
  noBusDetected:
    "No bus is currently detected at your stop, so I didn’t send a request.",
  chooseBus:
    "There are {count} buses at the stop: {services}. Which one do you need?",
  busUnconfirmed: "I can’t confirm which bus needs assistance.",
  rampUnavailable:
    "Ramp assistance is unavailable on Service {service}. No request was sent.",
  alightingOnboardOnly:
    "Alighting assistance is available once you’re onboard.",
  destinationRequired:
    "Choose where you’re getting off before requesting alighting assistance.",
  alightingConfirmation:
    "I’ll request alighting assistance for {destination}. Should I send it?",
  busChanged:
    "I can’t confirm that bus is still at this stop. No request was sent.",
  rampSent: "Your ramp request for Service {service} has been sent.",
  rampFailed: "I couldn’t send your ramp request.",
  extraTimeSent:
    "Your request for more boarding time on Service {service} has been sent.",
  extraTimeFailed: "I couldn’t request more boarding time.",
  journeyChanged: "Your journey context changed, so I didn’t send the request.",
  alightingSent: "Your alighting assistance request has been sent.",
  alightingFailed: "I couldn’t send your alighting assistance request.",
  endConfirmation: "End your Service {service} journey?",
  journeyEnded: "Your journey has ended. Find your bus is ready.",
  journeyEndFailed: "I couldn’t end your journey.",
  operatorNeedsJourney:
    "Confirm your bus stop or start a journey first so I can send the operator the correct context.",
  operatorConfirmation: "Ask a remote operator to help with this journey?",
  operatorSent: "A remote operator has been alerted and is checking your journey.",
  operatorFailed: "I couldn’t alert an operator. Please use the assistance control.",
  startDirectionsConfirmation:
    "Start walking guidance to the selected bus stop?",
  stopGuidanceConfirmation: "Stop the current walking guidance?",
} as const;

export type AssistantSafetyCopyKey = keyof typeof safetyEnglish;

const safetyCatalog: Record<
  AssistantLocale,
  Record<AssistantSafetyCopyKey, string>
> = {
  "en-SG": safetyEnglish,
  "zh-SG": {
    confirmationExpired: "确认已过期。请重新提出操作请求。",
    confirmationContextChanged: "行程情况已改变，因此没有执行该操作。请重新提出请求。",
    assistanceCancelled: "好的，我不会发送协助请求。",
    actionCancelled: "好的，操作已取消。",
    sayService: "请说出巴士服务号：{services}。",
    rampConfirmation: "是否为 {service} 号巴士请求斜坡板协助？",
    extraTimeConfirmation: "是否为 {service} 号巴士请求更多上车时间？",
    onboardBoardingBlocked: "您已经在车上。您可以请求下车协助。",
    stopUnconfirmed: "当前巴士站尚未确认，因此无法发送请求。",
    serviceUnconfirmed: "无法确认 {service} 号巴士在此站。请求未发送。",
    noBusDetected: "目前未在车站检测到巴士，因此请求未发送。",
    chooseBus: "车站有 {count} 辆巴士：{services}。您需要哪一辆？",
    busUnconfirmed: "无法确认需要协助的巴士。",
    rampUnavailable: "{service} 号巴士不提供斜坡板协助。请求未发送。",
    alightingOnboardOnly: "上车后才可请求下车协助。",
    destinationRequired: "请先选择下车站，再请求下车协助。",
    alightingConfirmation: "是否发送前往 {destination} 的下车协助请求？",
    busChanged: "无法确认该巴士仍在此站。请求未发送。",
    rampSent: "已发送 {service} 号巴士的斜坡板请求。",
    rampFailed: "无法发送斜坡板请求。",
    extraTimeSent: "已发送 {service} 号巴士的更多上车时间请求。",
    extraTimeFailed: "无法请求更多上车时间。",
    journeyChanged: "行程情况已改变，因此请求未发送。",
    alightingSent: "下车协助请求已发送。",
    alightingFailed: "无法发送下车协助请求。",
    endConfirmation: "是否结束 {service} 号巴士的行程？",
    journeyEnded: "行程已结束。您可以寻找下一趟巴士。",
    journeyEndFailed: "无法结束行程。",
    operatorNeedsJourney: "请先确认巴士站或开始行程，以便向操作员发送正确资料。",
    operatorConfirmation: "是否请求远程操作员协助此行程？",
    operatorSent: "已通知远程操作员，对方正在查看您的行程。",
    operatorFailed: "无法通知操作员。请使用协助按钮。",
    startDirectionsConfirmation: "开始前往所选巴士站的步行指引吗？",
    stopGuidanceConfirmation: "停止当前步行指引吗？",
  },
  "ms-SG": {
    confirmationExpired: "Pengesahan telah tamat. Minta tindakan itu semula.",
    confirmationContextChanged:
      "Konteks perjalanan berubah, jadi tindakan itu tidak dilakukan. Sila minta semula.",
    assistanceCancelled: "Baik. Permintaan bantuan tidak akan dihantar.",
    actionCancelled: "Baik. Tindakan itu dibatalkan.",
    sayService: "Sila sebut nombor perkhidmatan. {services}.",
    rampConfirmation: "Minta bantuan tanjakan untuk Perkhidmatan {service}?",
    extraTimeConfirmation:
      "Minta masa menaiki tambahan untuk Perkhidmatan {service}?",
    onboardBoardingBlocked:
      "Anda sudah berada dalam bas. Anda boleh meminta bantuan untuk turun.",
    stopUnconfirmed:
      "Permintaan tidak boleh dihantar kerana perhentian anda belum disahkan.",
    serviceUnconfirmed:
      "Perkhidmatan {service} tidak dapat disahkan di sini. Permintaan tidak dihantar.",
    noBusDetected:
      "Tiada bas dikesan di perhentian, jadi permintaan tidak dihantar.",
    chooseBus: "Terdapat {count} bas: {services}. Bas yang mana anda perlukan?",
    busUnconfirmed: "Bas yang memerlukan bantuan tidak dapat disahkan.",
    rampUnavailable:
      "Bantuan tanjakan tidak tersedia pada Perkhidmatan {service}. Permintaan tidak dihantar.",
    alightingOnboardOnly: "Bantuan turun tersedia selepas anda menaiki bas.",
    destinationRequired: "Pilih tempat turun sebelum meminta bantuan turun.",
    alightingConfirmation:
      "Hantar permintaan bantuan turun untuk {destination}?",
    busChanged:
      "Bas itu tidak lagi dapat disahkan di perhentian. Permintaan tidak dihantar.",
    rampSent:
      "Permintaan tanjakan untuk Perkhidmatan {service} telah dihantar.",
    rampFailed: "Permintaan tanjakan tidak dapat dihantar.",
    extraTimeSent:
      "Permintaan masa menaiki tambahan untuk Perkhidmatan {service} telah dihantar.",
    extraTimeFailed: "Masa menaiki tambahan tidak dapat diminta.",
    journeyChanged:
      "Konteks perjalanan berubah, jadi permintaan tidak dihantar.",
    alightingSent: "Permintaan bantuan turun telah dihantar.",
    alightingFailed: "Permintaan bantuan turun tidak dapat dihantar.",
    endConfirmation: "Tamatkan perjalanan Perkhidmatan {service}?",
    journeyEnded: "Perjalanan anda telah tamat. Carian bas sedia digunakan.",
    journeyEndFailed: "Perjalanan tidak dapat ditamatkan.",
    operatorNeedsJourney:
      "Sahkan perhentian bas atau mulakan perjalanan supaya konteks yang betul boleh dihantar kepada operator.",
    operatorConfirmation:
      "Minta operator jauh membantu perjalanan ini?",
    operatorSent:
      "Operator jauh telah dimaklumkan dan sedang menyemak perjalanan anda.",
    operatorFailed:
      "Operator tidak dapat dimaklumkan. Gunakan kawalan bantuan.",
    startDirectionsConfirmation:
      "Mulakan panduan berjalan ke perhentian bas yang dipilih?",
    stopGuidanceConfirmation: "Hentikan panduan berjalan semasa?",
  },
  "ta-SG": {
    confirmationExpired:
      "உறுதிப்படுத்தல் காலாவதியானது. செயலை மீண்டும் கேளுங்கள்.",
    confirmationContextChanged:
      "பயண நிலை மாறியதால் அந்த செயல் செய்யப்படவில்லை. மீண்டும் கேளுங்கள்.",
    assistanceCancelled: "சரி. உதவி கோரிக்கை அனுப்பப்படாது.",
    actionCancelled: "சரி. அந்த செயல் ரத்து செய்யப்பட்டது.",
    sayService: "சேவை எண்ணைச் சொல்லுங்கள். {services}.",
    rampConfirmation: "சேவை {service}-க்கு சாய்வுப்பாதை உதவி கோரவா?",
    extraTimeConfirmation: "சேவை {service}-க்கு கூடுதல் ஏறும் நேரம் கோரவா?",
    onboardBoardingBlocked:
      "நீங்கள் ஏற்கனவே பேருந்தில் உள்ளீர்கள். இறங்க உதவி கோரலாம்.",
    stopUnconfirmed:
      "உங்கள் நிறுத்தம் உறுதியாகாததால் கோரிக்கையை அனுப்ப முடியாது.",
    serviceUnconfirmed:
      "இந்த நிறுத்தத்தில் சேவை {service}-ஐ உறுதிப்படுத்த முடியவில்லை. கோரிக்கை அனுப்பப்படவில்லை.",
    noBusDetected:
      "நிறுத்தத்தில் பேருந்து கண்டறியப்படவில்லை; கோரிக்கை அனுப்பப்படவில்லை.",
    chooseBus:
      "நிறுத்தத்தில் {count} பேருந்துகள் உள்ளன: {services}. எது வேண்டும்?",
    busUnconfirmed:
      "எந்த பேருந்துக்கு உதவி தேவை என்பதை உறுதிப்படுத்த முடியவில்லை.",
    rampUnavailable:
      "சேவை {service}-ல் சாய்வுப்பாதை உதவி இல்லை. கோரிக்கை அனுப்பப்படவில்லை.",
    alightingOnboardOnly: "பேருந்தில் ஏறிய பிறகு இறங்கும் உதவி கிடைக்கும்.",
    destinationRequired:
      "இறங்கும் இடத்தைத் தேர்ந்தெடுத்த பிறகு உதவி கோருங்கள்.",
    alightingConfirmation:
      "{destination}-க்கான இறங்கும் உதவி கோரிக்கையை அனுப்பவா?",
    busChanged:
      "அந்த பேருந்து இன்னும் நிறுத்தத்தில் இருப்பதை உறுதிப்படுத்த முடியவில்லை. கோரிக்கை அனுப்பப்படவில்லை.",
    rampSent: "சேவை {service}-க்கான சாய்வுப்பாதை கோரிக்கை அனுப்பப்பட்டது.",
    rampFailed: "சாய்வுப்பாதை கோரிக்கையை அனுப்ப முடியவில்லை.",
    extraTimeSent:
      "சேவை {service}-க்கான கூடுதல் ஏறும் நேரக் கோரிக்கை அனுப்பப்பட்டது.",
    extraTimeFailed: "கூடுதல் ஏறும் நேரத்தை கோர முடியவில்லை.",
    journeyChanged: "பயண நிலை மாறியதால் கோரிக்கை அனுப்பப்படவில்லை.",
    alightingSent: "இறங்கும் உதவி கோரிக்கை அனுப்பப்பட்டது.",
    alightingFailed: "இறங்கும் உதவி கோரிக்கையை அனுப்ப முடியவில்லை.",
    endConfirmation: "சேவை {service} பயணத்தை முடிக்கவா?",
    journeyEnded: "உங்கள் பயணம் முடிந்தது. பேருந்தைத் தேட தயாராக உள்ளது.",
    journeyEndFailed: "பயணத்தை முடிக்க முடியவில்லை.",
    operatorNeedsJourney:
      "சரியான தகவலை இயக்குநருக்கு அனுப்ப பேருந்து நிறுத்தத்தை உறுதிப்படுத்தவும் அல்லது பயணத்தைத் தொடங்கவும்.",
    operatorConfirmation:
      "இந்தப் பயணத்திற்கு தொலைநிலை இயக்குநரின் உதவியைக் கோரவா?",
    operatorSent:
      "தொலைநிலை இயக்குநருக்கு அறிவிக்கப்பட்டது; அவர் உங்கள் பயணத்தைச் சரிபார்க்கிறார்.",
    operatorFailed:
      "இயக்குநருக்கு அறிவிக்க முடியவில்லை. உதவி கட்டுப்பாட்டைப் பயன்படுத்துங்கள்.",
    startDirectionsConfirmation:
      "தேர்ந்தெடுத்த பேருந்து நிறுத்தத்திற்கான நடை வழிகாட்டலைத் தொடங்கவா?",
    stopGuidanceConfirmation: "தற்போதைய நடை வழிகாட்டலை நிறுத்தவா?",
  },
};

export function assistantSafetyCopy(
  locale: AssistantLocale | undefined,
  key: AssistantSafetyCopyKey,
  variables: Record<string, string | number> = {},
) {
  const template = safetyCatalog[locale ?? defaultAssistantLocale][key];
  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    String(variables[name] ?? `{${name}}`),
  );
}
