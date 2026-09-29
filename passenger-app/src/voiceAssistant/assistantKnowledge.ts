import type { AssistantKnowledgeArticle, AssistantLocale } from "./types";

const sourceLabel: Record<AssistantLocale, string> = {
  "en-SG": "GoAssist travel guide",
  "zh-SG": "GoAssist 出行指南",
  "ms-SG": "Panduan perjalanan GoAssist",
  "ta-SG": "GoAssist பயண வழிகாட்டி",
};

type ArticleSeed = Omit<AssistantKnowledgeArticle, "sourceLabel">;

const seeds: ArticleSeed[] = [
  article(
    "journey-stages",
    "en-SG",
    "Journey guidance",
    "GoAssist follows five stages: walk to the stop, wait for the correct bus, board when safe, follow stops onboard, and exit when the door or ramp is ready.",
    [
      "journey",
      "travel",
      "walk",
      "wait",
      "board",
      "ride",
      "exit",
      "steps",
      "through",
      "everything",
    ],
  ),
  article(
    "journey-stages",
    "zh-SG",
    "行程指引",
    "GoAssist 提供五个阶段的指引：步行到车站、等候正确的巴士、安全上车、在车上查看站点，以及在车门或斜坡板准备好后下车。",
    ["行程", "步行", "等候", "上车", "车上", "下车", "步骤"],
  ),
  article(
    "journey-stages",
    "ms-SG",
    "Panduan perjalanan",
    "GoAssist membimbing anda melalui lima peringkat: berjalan ke perhentian, menunggu bas yang betul, menaiki bas apabila selamat, mengikuti hentian dalam bas dan turun apabila pintu atau tanjakan sedia.",
    [
      "perjalanan",
      "berjalan",
      "menunggu",
      "naik",
      "dalam bas",
      "turun",
      "langkah",
    ],
  ),
  article(
    "journey-stages",
    "ta-SG",
    "பயண வழிகாட்டல்",
    "GoAssist ஐந்து நிலைகளில் வழிகாட்டும்: நிறுத்தத்திற்கு நடப்பது, சரியான பேருந்துக்காகக் காத்திருப்பது, பாதுகாப்பாக ஏறுவது, பேருந்தில் நிறுத்தங்களைப் பின்தொடர்வது, கதவு அல்லது சாய்வுப்பாதை தயாரானதும் இறங்குவது.",
    ["பயணம்", "நட", "காத்திரு", "ஏறு", "பேருந்து", "இறங்கு", "படிகள்"],
  ),
  article(
    "ramp-safety",
    "en-SG",
    "Ramp assistance",
    "A ramp request does not deploy the ramp immediately. GoAssist confirms the bus and passenger request, then the vehicle checks that it is stopped, the brake is active, the door is open and the deployment area is clear. Board only when GoAssist says the ramp is ready.",
    ["ramp", "wheelchair", "board", "door", "safe", "obstacle", "assistance"],
    "REVIEWED_SAFETY",
  ),
  article(
    "ramp-safety",
    "zh-SG",
    "斜坡板协助",
    "提出斜坡板请求不会立即展开斜坡板。GoAssist 会确认巴士和乘客请求，车辆随后检查已经停稳、制动已启用、车门已打开且展开区域没有障碍。只有在 GoAssist 显示斜坡板已准备好后才上车。",
    ["斜坡板", "轮椅", "上车", "车门", "安全", "障碍", "协助"],
    "REVIEWED_SAFETY",
  ),
  article(
    "ramp-safety",
    "ms-SG",
    "Bantuan tanjakan",
    "Permintaan tanjakan tidak terus menggerakkan tanjakan. GoAssist mengesahkan bas dan permintaan penumpang, kemudian kenderaan memastikan ia berhenti, brek aktif, pintu terbuka dan kawasan tanjakan kosong. Naik hanya apabila GoAssist menyatakan tanjakan sedia.",
    [
      "tanjakan",
      "kerusi roda",
      "naik",
      "pintu",
      "selamat",
      "halangan",
      "bantuan",
    ],
    "REVIEWED_SAFETY",
  ),
  article(
    "ramp-safety",
    "ta-SG",
    "சாய்வுப்பாதை உதவி",
    "சாய்வுப்பாதை கோரிக்கை உடனடியாக அதை இயக்காது. GoAssist பேருந்தையும் பயணியின் கோரிக்கையையும் உறுதிப்படுத்தும். பின்னர் வாகனம் நின்றுள்ளதா, பிரேக் செயலிலா, கதவு திறந்துள்ளதா, பாதை தடையின்றி உள்ளதா எனச் சரிபார்க்கும். GoAssist சாய்வுப்பாதை தயார் எனக் கூறிய பிறகே ஏறுங்கள்.",
    [
      "சாய்வுப்பாதை",
      "சக்கர நாற்காலி",
      "ஏறு",
      "கதவு",
      "பாதுகாப்பு",
      "தடை",
      "உதவி",
    ],
    "REVIEWED_SAFETY",
  ),
  article(
    "identify-bus",
    "en-SG",
    "Identifying your bus",
    "Select a service before travelling. At the stop, GoAssist shows the detected service, destination and arrival status. If more than one bus is present, confirm the service number before requesting assistance.",
    ["identify", "bus", "service", "number", "destination", "arrival", "stop"],
  ),
  article(
    "identify-bus",
    "zh-SG",
    "识别巴士",
    "出发前请选择巴士服务。在车站，GoAssist 会显示检测到的服务号、目的地和抵达状态。如果同时有多辆巴士，请先确认服务号再请求协助。",
    ["识别", "巴士", "服务号", "目的地", "抵达", "车站"],
  ),
  article(
    "identify-bus",
    "ms-SG",
    "Mengenal pasti bas",
    "Pilih perkhidmatan sebelum perjalanan. Di perhentian, GoAssist menunjukkan perkhidmatan, destinasi dan status ketibaan yang dikesan. Jika terdapat lebih daripada satu bas, sahkan nombor perkhidmatan sebelum meminta bantuan.",
    [
      "kenal pasti",
      "bas",
      "perkhidmatan",
      "nombor",
      "destinasi",
      "ketibaan",
      "perhentian",
    ],
  ),
  article(
    "identify-bus",
    "ta-SG",
    "பேருந்தை அடையாளம் காணுதல்",
    "பயணத்திற்கு முன் சேவையைத் தேர்ந்தெடுக்கவும். நிறுத்தத்தில் கண்டறியப்பட்ட சேவை, இலக்கு மற்றும் வருகை நிலையை GoAssist காட்டும். ஒன்றுக்கு மேற்பட்ட பேருந்துகள் இருந்தால் உதவி கோருவதற்கு முன் சேவை எண்ணை உறுதிப்படுத்தவும்.",
    ["அடையாளம்", "பேருந்து", "சேவை", "எண்", "இலக்கு", "வருகை", "நிறுத்தம்"],
  ),
  article(
    "extra-time",
    "en-SG",
    "More boarding time",
    "You may request extra boarding time for mobility needs, age, injury, a stroller or luggage. GoAssist confirms the bus before sending the request, and you can cancel before it is sent.",
    [
      "extra time",
      "boarding",
      "elderly",
      "injury",
      "stroller",
      "luggage",
      "cancel",
    ],
  ),
  article(
    "extra-time",
    "zh-SG",
    "更多上车时间",
    "如有行动需要、年长、受伤、婴儿车或行李，您可以请求更多上车时间。GoAssist 会先确认巴士再发送请求，发送前可以取消。",
    ["更多时间", "上车", "年长", "受伤", "婴儿车", "行李", "取消"],
  ),
  article(
    "extra-time",
    "ms-SG",
    "Masa menaiki tambahan",
    "Anda boleh meminta masa menaiki tambahan kerana keperluan mobiliti, usia, kecederaan, kereta sorong bayi atau bagasi. GoAssist mengesahkan bas sebelum menghantar permintaan dan anda boleh membatalkannya sebelum dihantar.",
    [
      "masa tambahan",
      "menaiki",
      "warga emas",
      "kecederaan",
      "kereta sorong",
      "bagasi",
      "batal",
    ],
  ),
  article(
    "extra-time",
    "ta-SG",
    "கூடுதல் ஏறும் நேரம்",
    "இயக்கத் தேவை, வயது, காயம், குழந்தை வண்டி அல்லது சுமைக்காக கூடுதல் ஏறும் நேரம் கோரலாம். கோரிக்கையை அனுப்புவதற்கு முன் GoAssist பேருந்தை உறுதிப்படுத்தும்; அனுப்புவதற்கு முன் நீங்கள் ரத்து செய்யலாம்.",
    [
      "கூடுதல் நேரம்",
      "ஏறுதல்",
      "முதியவர்",
      "காயம்",
      "குழந்தை வண்டி",
      "சுமை",
      "ரத்து",
    ],
  ),
  article(
    "offline-guidance",
    "en-SG",
    "Using GoAssist offline",
    "Basic commands, saved journey steps and the GoAssist travel guide remain available without a network. Live arrivals and newly changed service information require a connection and are clearly marked unavailable when offline.",
    ["offline", "network", "internet", "arrival", "saved", "connection"],
  ),
  article(
    "offline-guidance",
    "zh-SG",
    "离线使用 GoAssist",
    "没有网络时，基本指令、已保存的行程步骤和 GoAssist 出行指南仍可使用。实时抵达时间和最新服务资料需要网络连接，离线时会明确显示为不可用。",
    ["离线", "网络", "互联网", "抵达", "保存", "连接"],
  ),
  article(
    "offline-guidance",
    "ms-SG",
    "Menggunakan GoAssist tanpa rangkaian",
    "Arahan asas, langkah perjalanan yang disimpan dan panduan GoAssist kekal tersedia tanpa rangkaian. Ketibaan langsung dan perubahan perkhidmatan terkini memerlukan sambungan dan akan ditanda tidak tersedia ketika luar talian.",
    [
      "luar talian",
      "rangkaian",
      "internet",
      "ketibaan",
      "disimpan",
      "sambungan",
    ],
  ),
  article(
    "offline-guidance",
    "ta-SG",
    "இணையமின்றி GoAssist பயன்படுத்துதல்",
    "இணையம் இல்லாமலும் அடிப்படை கட்டளைகள், சேமித்த பயணப் படிகள் மற்றும் GoAssist பயண வழிகாட்டி கிடைக்கும். நேரடி வருகை மற்றும் புதிய சேவை மாற்றங்களுக்கு இணைப்பு தேவை; இணையமில்லாதபோது அவை கிடைக்கவில்லை எனக் காட்டப்படும்.",
    ["இணையமின்றி", "வலைப்பின்னல்", "இணையம்", "வருகை", "சேமித்த", "இணைப்பு"],
  ),
  article(
    "accessibility-controls",
    "en-SG",
    "Accessibility controls",
    "In Profile, choose only the support you need. Mobility, vision, hearing and simpler-journey settings stay independent, and a group preset can be turned off again without changing unrelated choices.",
    [
      "accessibility",
      "settings",
      "profile",
      "mobility",
      "vision",
      "hearing",
      "preset",
      "turn off",
    ],
  ),
  article(
    "accessibility-controls",
    "zh-SG",
    "无障碍设置",
    "在个人资料中只选择所需的协助。行动、视力、听力和简化行程设置互相独立；组合预设也可再次关闭，不会改变无关选项。",
    ["无障碍", "设置", "个人资料", "行动", "视力", "听力", "预设", "关闭"],
  ),
  article(
    "accessibility-controls",
    "ms-SG",
    "Kawalan aksesibiliti",
    "Dalam Profil, pilih bantuan yang anda perlukan sahaja. Tetapan mobiliti, penglihatan, pendengaran dan perjalanan ringkas kekal berasingan; pratetap kumpulan boleh dimatikan tanpa mengubah pilihan lain.",
    [
      "aksesibiliti",
      "tetapan",
      "profil",
      "mobiliti",
      "penglihatan",
      "pendengaran",
      "pratetap",
      "matikan",
    ],
  ),
  article(
    "accessibility-controls",
    "ta-SG",
    "அணுகல்தன்மை கட்டுப்பாடுகள்",
    "சுயவிவரத்தில் தேவையான உதவிகளை மட்டும் தேர்ந்தெடுக்கவும். இயக்கம், பார்வை, கேள்வி மற்றும் எளிய பயண அமைப்புகள் தனித்தனியாக இருக்கும்; குழு முன்தேர்வை மற்ற விருப்பங்களை மாற்றாமல் அணைக்கலாம்.",
    [
      "அணுகல்தன்மை",
      "அமைப்புகள்",
      "சுயவிவரம்",
      "இயக்கம்",
      "பார்வை",
      "கேள்வி",
      "முன்தேர்வு",
    ],
  ),
  article(
    "walking-guide",
    "en-SG",
    "Walking to the stop",
    "Diagram guidance is always available. Follow the current maneuver, distance and road name, then open Show steps for up to three larger instructions. Camera guidance is optional and returns to the diagram when location or compass quality is poor.",
    [
      "walking",
      "directions",
      "diagram",
      "camera",
      "compass",
      "road",
      "steps",
      "off route",
    ],
  ),
  article(
    "walking-guide",
    "zh-SG",
    "步行到车站",
    "图示路线始终可用。请按照当前转向、距离和道路名称前进；打开“显示步骤”可查看最多三项放大指引。相机指引是可选功能，定位或指南针质量不佳时会返回图示模式。",
    ["步行", "路线", "图示", "相机", "指南针", "道路", "步骤", "偏离路线"],
  ),
  article(
    "walking-guide",
    "ms-SG",
    "Berjalan ke perhentian",
    "Panduan rajah sentiasa tersedia. Ikut belokan semasa, jarak dan nama jalan; buka Tunjukkan langkah untuk sehingga tiga arahan besar. Panduan kamera adalah pilihan dan kembali ke rajah apabila lokasi atau kompas kurang tepat.",
    [
      "berjalan",
      "arah",
      "rajah",
      "kamera",
      "kompas",
      "jalan",
      "langkah",
      "tersasar",
    ],
  ),
  article(
    "walking-guide",
    "ta-SG",
    "நிறுத்தத்திற்கு நடப்பது",
    "வரைபட வழிகாட்டல் எப்போதும் கிடைக்கும். தற்போதைய திருப்பம், தூரம் மற்றும் சாலை பெயரைப் பின்பற்றவும்; மூன்று பெரிய வழிமுறைகள் வரை பார்க்க படிகளைக் காட்டு என்பதைத் திறக்கவும். இடம் அல்லது திசைகாட்டி தரம் குறைந்தால் கேமரா வழிகாட்டல் வரைபடத்திற்கு திரும்பும்.",
    ["நட", "வழி", "வரைபடம்", "கேமரா", "திசைகாட்டி", "சாலை", "படிகள்"],
  ),
  article(
    "waiting-boarding",
    "en-SG",
    "Waiting and boarding",
    "Wait in the displayed boarding area and confirm the service number and destination. Assistance status shows whether the request was received. Do not board until the vehicle is stopped and GoAssist shows the door or ramp is ready.",
    ["wait", "boarding", "service", "destination", "door", "ramp", "ready"],
    "REVIEWED_SAFETY",
  ),
  article(
    "waiting-boarding",
    "zh-SG",
    "等候与上车",
    "请在显示的上车区域等候，并确认服务号和目的地。协助状态会显示请求是否已收到。车辆停稳且 GoAssist 显示车门或斜坡板已准备好后才上车。",
    ["等候", "上车", "服务号", "目的地", "车门", "斜坡板", "准备好"],
    "REVIEWED_SAFETY",
  ),
  article(
    "waiting-boarding",
    "ms-SG",
    "Menunggu dan menaiki bas",
    "Tunggu di kawasan menaiki yang dipaparkan dan sahkan nombor perkhidmatan serta destinasi. Status bantuan menunjukkan sama ada permintaan diterima. Jangan naik sehingga kenderaan berhenti dan GoAssist menyatakan pintu atau tanjakan sedia.",
    [
      "menunggu",
      "menaiki",
      "perkhidmatan",
      "destinasi",
      "pintu",
      "tanjakan",
      "sedia",
    ],
    "REVIEWED_SAFETY",
  ),
  article(
    "waiting-boarding",
    "ta-SG",
    "காத்திருத்தலும் ஏறுதலும்",
    "காட்டப்படும் ஏறும் பகுதியில் காத்திருந்து சேவை எண்ணையும் இலக்கையும் உறுதிப்படுத்தவும். உதவி நிலை கோரிக்கை பெறப்பட்டதைக் காட்டும். வாகனம் நின்று கதவு அல்லது சாய்வுப்பாதை தயார் என GoAssist காட்டிய பிறகே ஏறுங்கள்.",
    ["காத்திரு", "ஏறு", "சேவை", "இலக்கு", "கதவு", "சாய்வுப்பாதை", "தயார்"],
    "REVIEWED_SAFETY",
  ),
  article(
    "riding-alighting",
    "en-SG",
    "Riding and alighting",
    "The onboard strip shows the current stop, next stop, destination and stops remaining. Prepare when your destination is near. Request alighting help before arrival, and leave only after the bus stops and the door or ramp is shown ready.",
    [
      "onboard",
      "ride",
      "next stop",
      "destination",
      "stops remaining",
      "alight",
      "exit",
    ],
    "REVIEWED_SAFETY",
  ),
  article(
    "riding-alighting",
    "zh-SG",
    "乘车与下车",
    "车上路线条会显示当前站、下一站、目的地和剩余站数。接近目的地时请做好准备，并在抵达前请求下车协助。巴士停稳且车门或斜坡板显示已准备好后才下车。",
    ["车上", "乘车", "下一站", "目的地", "剩余站", "下车", "离开"],
    "REVIEWED_SAFETY",
  ),
  article(
    "riding-alighting",
    "ms-SG",
    "Dalam bas dan turun",
    "Jalur perjalanan menunjukkan hentian semasa, hentian seterusnya, destinasi dan baki hentian. Bersedia apabila destinasi hampir dan minta bantuan turun sebelum tiba. Turun hanya selepas bas berhenti dan pintu atau tanjakan ditunjukkan sedia.",
    [
      "dalam bas",
      "hentian seterusnya",
      "destinasi",
      "baki hentian",
      "turun",
      "keluar",
    ],
    "REVIEWED_SAFETY",
  ),
  article(
    "riding-alighting",
    "ta-SG",
    "பேருந்தில் பயணித்தலும் இறங்குதலும்",
    "பயணப் பட்டை தற்போதைய நிறுத்தம், அடுத்த நிறுத்தம், இலக்கு மற்றும் மீதமுள்ள நிறுத்தங்களைக் காட்டும். இலக்கு நெருங்கும்போது தயாராகி, வருவதற்கு முன் இறங்கும் உதவி கோரவும். பேருந்து நின்று கதவு அல்லது சாய்வுப்பாதை தயார் எனக் காட்டிய பிறகே இறங்குங்கள்.",
    [
      "பேருந்தில்",
      "அடுத்த நிறுத்தம்",
      "இலக்கு",
      "மீதமுள்ள",
      "இறங்கு",
      "வெளியேறு",
    ],
    "REVIEWED_SAFETY",
  ),
  article(
    "autonomous-safety",
    "en-SG",
    "Autonomous bus safety",
    "The AI assistant cannot drive or control equipment. Vehicle motion, doors and ramps use separate safety controllers and fresh telemetry. A blocked path, stale signal, conflicting assignment or failed interlock stops the action and alerts the passenger and operator.",
    [
      "autonomous",
      "driverless",
      "safety",
      "control",
      "telemetry",
      "interlock",
      "blocked",
      "operator",
    ],
    "REVIEWED_SAFETY",
  ),
  article(
    "autonomous-safety",
    "zh-SG",
    "自动驾驶巴士安全",
    "AI 助理不能驾驶或控制设备。车辆移动、车门和斜坡板由独立安全控制器及最新遥测资料管理。道路受阻、信号过期、分配冲突或安全联锁失败时，操作会停止并通知乘客和操作员。",
    ["自动驾驶", "无人驾驶", "安全", "控制", "遥测", "联锁", "受阻", "操作员"],
    "REVIEWED_SAFETY",
  ),
  article(
    "autonomous-safety",
    "ms-SG",
    "Keselamatan bas autonomi",
    "Pembantu AI tidak boleh memandu atau mengawal peralatan. Pergerakan, pintu dan tanjakan menggunakan pengawal keselamatan serta telemetri baharu yang berasingan. Laluan terhalang, isyarat lapuk, tugasan bercanggah atau saling kunci gagal akan menghentikan tindakan dan memaklumkan penumpang serta operator.",
    [
      "autonomi",
      "tanpa pemandu",
      "keselamatan",
      "kawal",
      "telemetri",
      "halangan",
      "operator",
    ],
    "REVIEWED_SAFETY",
  ),
  article(
    "autonomous-safety",
    "ta-SG",
    "தானியங்கி பேருந்து பாதுகாப்பு",
    "AI உதவியாளர் வாகனத்தை ஓட்டவோ உபகரணங்களை கட்டுப்படுத்தவோ முடியாது. வாகன இயக்கம், கதவுகள் மற்றும் சாய்வுப்பாதைகள் தனி பாதுகாப்பு கட்டுப்பாடுகள் மற்றும் புதிய தொலைஅளவீட்டைப் பயன்படுத்தும். பாதை தடை, பழைய சிக்னல், முரண்பட்ட ஒதுக்கீடு அல்லது பாதுகாப்பு இணைப்பு தோல்வி செயலை நிறுத்தி பயணிக்கும் நபருக்கும் இயக்குநருக்கும் அறிவிக்கும்.",
    [
      "தானியங்கி",
      "ஓட்டுநரில்லா",
      "பாதுகாப்பு",
      "கட்டுப்பாடு",
      "தொலைஅளவீடு",
      "தடை",
      "இயக்குநர்",
    ],
    "REVIEWED_SAFETY",
  ),
  article(
    "physical-assistance",
    "en-SG",
    "Assistance without the app",
    "At an equipped stop, use the large tactile assistance control or NFC option. The stop gives visual, spoken and vibration acknowledgement. The request is linked to the approaching bus, while the passenger can still cancel or ask an operator for help.",
    [
      "physical button",
      "tactile",
      "nfc",
      "no phone",
      "stop",
      "vibration",
      "operator",
    ],
  ),
  article(
    "physical-assistance",
    "zh-SG",
    "无需应用程序的协助",
    "在配备设备的车站，可使用大型触觉协助按钮或 NFC。车站会通过视觉、语音和振动确认。请求会连接到接近的巴士，乘客仍可取消或请求操作员帮助。",
    ["实体按钮", "触觉", "nfc", "没有手机", "车站", "振动", "操作员"],
  ),
  article(
    "physical-assistance",
    "ms-SG",
    "Bantuan tanpa aplikasi",
    "Di perhentian yang dilengkapi, gunakan kawalan bantuan sentuhan besar atau NFC. Perhentian memberi pengesahan visual, suara dan getaran. Permintaan dipautkan kepada bas yang menghampiri dan penumpang masih boleh membatalkan atau meminta bantuan operator.",
    [
      "butang fizikal",
      "sentuhan",
      "nfc",
      "tanpa telefon",
      "perhentian",
      "getaran",
      "operator",
    ],
  ),
  article(
    "physical-assistance",
    "ta-SG",
    "செயலி இல்லாத உதவி",
    "வசதியுள்ள நிறுத்தத்தில் பெரிய தொட்டு உணரக்கூடிய உதவி கட்டுப்பாடு அல்லது NFC-ஐப் பயன்படுத்தவும். நிறுத்தம் காட்சி, குரல் மற்றும் அதிர்வு உறுதிப்படுத்தலை வழங்கும். கோரிக்கை நெருங்கும் பேருந்துடன் இணைக்கப்படும்; பயணி ரத்து செய்யவோ இயக்குநரின் உதவியை கேட்கவோ முடியும்.",
    [
      "உடல் பொத்தான்",
      "தொட்டு உணர்வு",
      "nfc",
      "தொலைபேசி இல்லை",
      "நிறுத்தம்",
      "அதிர்வு",
      "இயக்குநர்",
    ],
  ),
  article(
    "emergency-help",
    "en-SG",
    "Urgent help",
    "For immediate danger or a medical emergency, use the vehicle emergency control or contact emergency services. GoAssist can escalate an assistance case to an operator, but it is not an emergency service and must not delay urgent help.",
    [
      "emergency",
      "danger",
      "medical",
      "fall",
      "illness",
      "smoke",
      "urgent",
      "operator",
    ],
    "REVIEWED_SAFETY",
  ),
  article(
    "emergency-help",
    "zh-SG",
    "紧急协助",
    "如有即时危险或医疗紧急情况，请使用车内紧急控制装置或联系紧急服务。GoAssist 可把协助个案升级给操作员，但它不是紧急服务，不能延误紧急求助。",
    ["紧急", "危险", "医疗", "跌倒", "疾病", "烟雾", "迫切", "操作员"],
    "REVIEWED_SAFETY",
  ),
  article(
    "emergency-help",
    "ms-SG",
    "Bantuan kecemasan",
    "Jika terdapat bahaya segera atau kecemasan perubatan, gunakan kawalan kecemasan kenderaan atau hubungi perkhidmatan kecemasan. GoAssist boleh menaikkan kes kepada operator, tetapi bukan perkhidmatan kecemasan dan tidak boleh melambatkan bantuan segera.",
    [
      "kecemasan",
      "bahaya",
      "perubatan",
      "jatuh",
      "sakit",
      "asap",
      "segera",
      "operator",
    ],
    "REVIEWED_SAFETY",
  ),
  article(
    "emergency-help",
    "ta-SG",
    "அவசர உதவி",
    "உடனடி ஆபத்து அல்லது மருத்துவ அவசரநிலை இருந்தால் வாகன அவசர கட்டுப்பாட்டைப் பயன்படுத்தவும் அல்லது அவசர சேவையைத் தொடர்புகொள்ளவும். GoAssist ஒரு உதவி வழக்கை இயக்குநரிடம் உயர்த்தலாம்; ஆனால் அது அவசர சேவை அல்ல, உடனடி உதவியை தாமதப்படுத்தக் கூடாது.",
    [
      "அவசரம்",
      "ஆபத்து",
      "மருத்துவம்",
      "விழுதல்",
      "நோய்",
      "புகை",
      "உடனடி",
      "இயக்குநர்",
    ],
    "REVIEWED_SAFETY",
  ),
];

export const assistantKnowledgePackVersion = "2026.09.1";

export const assistantKnowledgeArticles: AssistantKnowledgeArticle[] =
  seeds.map((seed) => ({ ...seed, sourceLabel: sourceLabel[seed.locale] }));

export type AssistantKnowledgeMatch = {
  article: AssistantKnowledgeArticle;
  score: number;
  exactKeywordMatches: number;
  exactTitleMatches: number;
  queryCoverage: number;
  confidence: number;
  leadMargin: number;
  matchedTerms: string[];
};

export function searchAssistantKnowledge(
  query: string,
  locale: AssistantLocale,
  limit = 4,
  now = new Date(),
): AssistantKnowledgeMatch[] {
  const queryTokens = contentTokens(query, locale);
  if (queryTokens.size === 0) return [];
  const ranked = assistantKnowledgeArticles
    .filter(
      (item) =>
        item.locale === locale &&
        (!item.validUntil ||
          new Date(item.validUntil).getTime() >= now.getTime()),
    )
    .map((article) => scoreArticle(article, queryTokens, locale))
    .filter(
      (match) =>
        match.exactKeywordMatches + match.exactTitleMatches > 0 &&
        match.queryCoverage >= 0.5,
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(4, limit)));
  return ranked.map((match, index) => ({
    ...match,
    leadMargin:
      index === 0
        ? Math.max(0, match.confidence - (ranked[1]?.confidence ?? 0))
        : 0,
  }));
}

export function isConfidentAssistantKnowledgeMatch(
  match: AssistantKnowledgeMatch | undefined,
  matchCount: number,
) {
  return Boolean(
    match &&
      match.queryCoverage >= 0.5 &&
      match.confidence >= 0.55 &&
      (matchCount === 1 || match.leadMargin >= 0.12),
  );
}

export function assistantKnowledgeTokens(
  value: string,
  locale: AssistantLocale,
) {
  return [...contentTokens(value, locale)];
}

function article(
  id: string,
  locale: AssistantLocale,
  title: string,
  body: string,
  keywords: string[],
  safetyClass: AssistantKnowledgeArticle["safetyClass"] = "GENERAL",
): ArticleSeed {
  return { id: `${id}:${locale}`, locale, title, body, keywords, safetyClass };
}

function scoreArticle(
  article: AssistantKnowledgeArticle,
  queryTokens: Set<string>,
  locale: AssistantLocale,
) {
  const titleTokens = contentTokens(article.title, locale);
  const bodyTokens = contentTokens(article.body, locale);
  const keywordTokens = contentTokens(article.keywords.join(" "), locale);
  const matchedTerms: string[] = [];
  let exactKeywordMatches = 0;
  let exactTitleMatches = 0;
  let bodyMatches = 0;
  queryTokens.forEach((token) => {
    const keywordMatch = hasTokenVariant(keywordTokens, token);
    const titleMatch = hasTokenVariant(titleTokens, token);
    const bodyMatch = hasTokenVariant(bodyTokens, token);
    if (keywordMatch) exactKeywordMatches += 1;
    if (titleMatch) exactTitleMatches += 1;
    if (bodyMatch) bodyMatches += 1;
    if (keywordMatch || titleMatch || bodyMatch) matchedTerms.push(token);
  });
  const score = exactKeywordMatches * 5 + exactTitleMatches * 4 + bodyMatches;
  return {
    article,
    score,
    exactKeywordMatches,
    exactTitleMatches,
    queryCoverage: matchedTerms.length / queryTokens.size,
    confidence: Math.min(
      1,
      score / (Math.max(1, matchedTerms.length) * 10),
    ),
    leadMargin: 0,
    matchedTerms,
  };
}

const stopWords: Record<AssistantLocale, Set<string>> = {
  "en-SG": new Set([
    "a",
    "about",
    "and",
    "are",
    "can",
    "does",
    "for",
    "how",
    "i",
    "is",
    "it",
    "me",
    "my",
    "of",
    "please",
    "stay",
    "tell",
    "the",
    "to",
    "what",
    "when",
    "where",
    "which",
    "with",
    "you",
  ]),
  "zh-SG": new Set(["什么", "怎样", "怎么", "可以", "请问"]),
  "ms-SG": new Set([
    "apa",
    "bagaimana",
    "boleh",
    "dan",
    "di",
    "ini",
    "saya",
    "yang",
  ]),
  "ta-SG": new Set([
    "எப்படி",
    "எப்போது",
    "என்ன",
    "நான்",
    "இது",
    "இருக்கும்",
    "மற்றும்",
  ]),
};

function contentTokens(value: string, locale: AssistantLocale) {
  const normalized = value.normalize("NFKC").toLocaleLowerCase(locale);
  if (locale === "zh-SG") {
    const compact = normalized.replace(/[^\p{L}\p{M}\p{N}]/gu, "");
    const tokens = new Set<string>();
    for (let index = 0; index < compact.length - 1; index += 1) {
      const token = compact.slice(index, index + 2);
      if (!stopWords[locale].has(token)) tokens.add(token);
    }
    return tokens;
  }
  return new Set(
    normalized
      .split(/[^\p{L}\p{M}\p{N}]+/u)
      .map((token) => token.trim())
      .map(canonicalToken)
      .filter(
        (token) => token.length > 1 && !stopWords[locale].has(token),
      ),
  );
}

function canonicalToken(token: string) {
  const aliases: Record<string, string> = {
    safely: "safe",
    safety: "safe",
    sheltered: "shelter",
    shelters: "shelter",
    routes: "route",
    buses: "bus",
    arriving: "arrival",
    arrives: "arrival",
    arrived: "arrival",
    பாதுகாப்பாக: "பாதுகாப்பு",
  };
  return aliases[token] ?? token;
}

function hasTokenVariant(tokens: Set<string>, queryToken: string) {
  if (tokens.has(queryToken)) return true;
  if (queryToken.length < 5) return false;
  return [...tokens].some(
    (token) =>
      token.length >= 5 &&
      (token.startsWith(queryToken) || queryToken.startsWith(token)),
  );
}
