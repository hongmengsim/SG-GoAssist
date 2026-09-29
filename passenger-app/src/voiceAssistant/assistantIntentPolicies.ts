import type {
  AssistantContext,
  AssistantIntent,
  AssistantLocale,
} from "./types";

export type AssistantIntentRisk = "READ_ONLY" | "STATE_CHANGE";

export type AssistantIntentPolicy = {
  type: AssistantIntent["type"];
  risk: AssistantIntentRisk;
  aiConfidenceThreshold: number;
  requiresConfirmation: boolean;
  modelAllowed: boolean;
  aliases: Partial<Record<AssistantLocale, RegExp[]>>;
  contextValidator: (context: AssistantContext) => boolean;
};

const alwaysValid = () => true;
const activeJourney = (context: AssistantContext) => context.hasActiveJourney;
const atConfirmedStop = (context: AssistantContext) =>
  Boolean(context.currentStop);
const onboardJourney = (context: AssistantContext) =>
  context.hasActiveJourney && context.onboard;
const operatorContext = (context: AssistantContext) =>
  context.hasActiveJourney || Boolean(context.currentStop);

export const assistantIntentPolicies: readonly AssistantIntentPolicy[] = [
  policy("CONFIRM", "READ_ONLY", true, {
    "en-SG": [/^(yes|yeah|yep|confirm|please do|go ahead|do it)$/],
    "zh-SG": [/^(是|好的|确认|请执行|可以)$/],
    "ms-SG": [/^(ya|baik|sahkan|teruskan|lakukannya)$/],
    "ta-SG": [/^(ஆம்|சரி|உறுதிப்படுத்து|தொடரவும்|செய்யுங்கள்)$/],
  }),
  policy("CANCEL", "READ_ONLY", true, {
    "en-SG": [/^(no|nope|cancel|do not|don't|never mind|stop)$/],
    "zh-SG": [/^(不|不要|取消|停止)$/],
    "ms-SG": [/^(tidak|jangan|batal|berhenti)$/],
    "ta-SG": [/^(இல்லை|வேண்டாம்|ரத்து|நிறுத்து)$/],
  }),
  policy(
    "REQUEST_OPERATOR_HELP",
    "STATE_CHANGE",
    true,
    {
      "en-SG": [
        /\b(ask|call|contact|get|need|want)\b.*\b(operator|human|person|staff)\b/,
        /\b(operator|human|person|staff)\b.*\b(help|assist|support)\b/,
      ],
      "zh-SG": [
        /(联系|呼叫|需要|请求).*(人工|人员|操作员)|(人工|人员|操作员).*(帮助|协助)/,
      ],
      "ms-SG": [
        /(hubungi|panggil|perlukan|minta).*(operator|manusia|kakitangan)|(operator|manusia|kakitangan).*(bantuan|tolong)/,
      ],
      "ta-SG": [
        /(தொடர்பு|அழை|வேண்டும்|கோரு).*(மனித|இயக்குநர்|பணியாளர்)|(மனித|இயக்குநர்|பணியாளர்).*(உதவி)/,
      ],
    },
    operatorContext,
  ),
  policy("STOP_GUIDANCE", "STATE_CHANGE", true, {
    "en-SG": [/\b(stop|end|cancel)\b.*\b(guidance|directions|navigation)\b/],
    "zh-SG": [/(停止|结束).*(导航|路线|指引)/],
    "ms-SG": [/(hentikan|berhenti).*(panduan|arah|navigasi)/],
    "ta-SG": [/(வழிகாட்டலை|வழியை).*(நிறுத்து)/],
  }),
  policy("REPEAT_GUIDANCE", "READ_ONLY", true, {
    "en-SG": [/\b(repeat|say that again|repeat that|again please)\b/],
    "zh-SG": [/(重复|再说一次)/],
    "ms-SG": [/(ulang|sebut sekali lagi)/],
    "ta-SG": [/(மீண்டும்|மறுபடியும் சொல்ல)/],
  }),
  policy(
    "REQUEST_ALIGHTING_HELP",
    "STATE_CHANGE",
    true,
    {
      "en-SG": [
        /\b(help|assist)\b.*\b(get off|getting off|alight|disembark|leave the bus)\b/,
      ],
      "zh-SG": [/(下车|落车).*(帮助|协助)/],
      "ms-SG": [/(bantuan|tolong).*(turun|keluar bas)/],
      "ta-SG": [/(இறங்க|வெளியேற).*(உதவி)/],
    },
    onboardJourney,
  ),
  policy(
    "REQUEST_EXTRA_TIME",
    "STATE_CHANGE",
    true,
    {
      "en-SG": [
        /\b(request|need|give me|more|extra)\b.*\b(boarding time|time to board|dwell time)\b/,
      ],
      "zh-SG": [/(更多|额外).*(上车|登车).*(时间)/],
      "ms-SG": [/(masa tambahan|lebih masa).*(naik|menaiki)/],
      "ta-SG": [
        /(கூடுதல்|அதிக).*(ஏறும்|ஏற).*(நேரம்)/,
        /(ஏறும்|ஏற).*(கூடுதல்|அதிக).*(நேரம்)/,
      ],
    },
    atConfirmedStop,
  ),
  policy(
    "REQUEST_RAMP",
    "STATE_CHANGE",
    true,
    {
      "en-SG": [
        /\b(deploy|request|need|send|use|provide)\b.*\b(ramp|wheelchair ramp|boarding assistance)\b/,
        /\b(ramp|wheelchair ramp)\b.*\b(please|assistance|request)\b/,
      ],
      "zh-SG": [
        /(请求|需要|请).*(斜坡板|轮椅坡道|登车协助)|(斜坡板|轮椅坡道).*(请求|需要|请协助)/,
      ],
      "ms-SG": [
        /(minta|perlukan|sila|tolong).*(tanjakan|ramp|bantuan kerusi roda)|(tanjakan|ramp).*(minta|perlukan|sila)/,
      ],
      "ta-SG": [
        /(கோரு|கோரிக்கை|வேண்டும்|தயவு செய்து).*(சாய்வுப்பாதை|சக்கர நாற்காலி)|(சாய்வுப்பாதை|சக்கர நாற்காலி).*(கோரிக்கை|வேண்டும்|தயவு செய்து)/,
      ],
    },
    atConfirmedStop,
  ),
  policy(
    "END_JOURNEY",
    "STATE_CHANGE",
    true,
    {
      "en-SG": [/\b(end|finish|stop)\b.*\b(my )?journey\b/],
      "zh-SG": [/(结束|完成).*(行程|旅程)/],
      "ms-SG": [/(tamatkan|akhiri).*(perjalanan)/],
      "ta-SG": [/(பயணத்தை).*(முடி|நிறுத்து)/],
    },
    activeJourney,
  ),
  policy("GET_SHELTERED_ROUTE", "READ_ONLY", true, {
    "en-SG": [
      /\b(which|what|show|find|recommend)\b.*\b(route|way|path|walk)\b.*\b(shelter(?:ed)?|covered|under cover)\b/,
      /\b(shelter(?:ed)?|covered|under cover)\b.*\b(route|way|path|walk)\b/,
    ],
    "zh-SG": [
      /(有盖|遮蔽|遮雨|遮棚).*(路线|路径)|(路线|路径).*(有盖|遮蔽|遮雨|遮棚)/,
    ],
    "ms-SG": [
      /(berbumbung|berteduh|terlindung).*(laluan|jalan)|(laluan|jalan).*(berbumbung|berteduh|terlindung)/,
    ],
    "ta-SG": [
      /(மூடப்பட்ட|நிழற்குடை|கூரையுள்ள).*(வழி|பாதை)|(வழி|பாதை).*(மூடப்பட்ட|நிழற்குடை|கூரையுள்ள)/,
    ],
  }),
  policy("GET_STOP_AMENITIES", "READ_ONLY", true, {
    "en-SG": [
      /\b(is|does|what|which|show)\b.*\b(stop|bus stop)\b.*\b(shelter|seat|lighting|tactile|step[- ]?free|amenit|facilit|button|beacon)\b/,
      /\b(amenit|facilit)\w*\b.*\b(stop|here)\b/,
    ],
    "zh-SG": [/(巴士站|车站).*(设施|有盖|座位|照明|无障碍|盲道)/],
    "ms-SG": [
      /(perhentian|hentian).*(kemudahan|berbumbung|tempat duduk|lampu|tanpa tangga)/,
    ],
    "ta-SG": [
      /(பேருந்து நிறுத்தம்|நிறுத்தம்).*(வசதி|கூரை|இருக்கை|விளக்கு|படிக்கட்டு இல்லா)/,
    ],
  }),
  policy("GET_SERVICE_ADVISORIES", "READ_ONLY", true, {
    "en-SG": [
      /\b(any|what|show|is there)\b.*\b(delay(?:s|ed)?|disruption(?:s)?|advis(?:ory|ories)|service alert(?:s)?|warning(?:s)?)\b/,
      /\b(bus|service|route)\b.*\b(delay(?:s|ed)?|disrupted|affected)\b/,
    ],
    "zh-SG": [/(延误|中断|服务通知|交通提示)/],
    "ms-SG": [/(kelewatan|gangguan|nasihat perkhidmatan|amaran perkhidmatan)/],
    "ta-SG": [/(தாமதம்|சேவை தடங்கல்|சேவை அறிவிப்பு)/],
  }),
  policy("GET_CURRENT_STOP", "READ_ONLY", true, {
    "en-SG": [
      /\b(find|locate|show|which|where is)\b.*\b(nearest|nearby|closest)\b.*\b(bus )?stop\b/,
      /\b(nearest|nearby|closest)\b.*\b(bus )?stop\b/,
      /^(where am i|current stop|which stop am i at)$/,
    ],
    "zh-SG": [
      /(最近|附近|最靠近).*(巴士站|车站)/,
      /(我在哪里|当前车站|哪个车站)/,
    ],
    "ms-SG": [
      /(perhentian bas).*(terdekat|berdekatan)/,
      /(di mana saya|perhentian semasa)/,
    ],
    "ta-SG": [
      /(அருகிலுள்ள|நெருக்கமான).*(பேருந்து நிறுத்தம்)/,
      /(நான் எங்கே|தற்போதைய நிறுத்தம்)/,
    ],
  }),
  policy(
    "START_DIRECTIONS",
    "STATE_CHANGE",
    true,
    {
      "en-SG": [/\b(guide|directions|navigate|take me)\b.*\b(bus )?stop\b/],
      "zh-SG": [/(带我|指引|路线).*(巴士站|车站)/],
      "ms-SG": [/(arah|pandu|bawa).*(perhentian bas)/],
      "ta-SG": [
        /(வழி|வழிகாட்டு).*(பேருந்து நிறுத்தம்)/,
        /(பேருந்து நிறுத்த).*(வழி|வழிகாட்டு)/,
      ],
    },
    atConfirmedStop,
  ),
  policy("GET_ACTIVE_BUS", "READ_ONLY", true, {
    "en-SG": [/\bwhat bus\b.*\b(waiting|taking|my bus)\b/],
    "zh-SG": [/(等哪辆|选择了哪辆|我的巴士)/],
    "ms-SG": [/(bas saya|bas yang saya tunggu)/],
    "ta-SG": [/(என் பேருந்து|காத்திருக்கும் பேருந்து)/],
  }),
  policy("GET_BUS_AT_STOP", "READ_ONLY", true, {
    "en-SG": [/\b(what|which) (bus|buses)\b.*\b(here|at (the|my|this) stop)\b/],
    "zh-SG": [/(什么|哪辆).*(巴士).*(这里|车站)/],
    "ms-SG": [/(bas apa|bas mana).*(di sini|perhentian)/],
    "ta-SG": [/(எந்த|என்ன).*(பேருந்து).*(இங்கே|நிறுத்தம்)/],
  }),
  policy("GET_ARRIVAL", "READ_ONLY", true, {
    "en-SG": [/\b(when|how long|what time)\b.*\b(bus|arriv|coming)\b/],
    "zh-SG": [/(什么时候|多久).*(巴士|到达|抵达)/],
    "ms-SG": [/(bila|berapa lama).*(bas|tiba|sampai)/],
    "ta-SG": [/(எப்போது|எவ்வளவு நேரம்).*(பேருந்து|வரும்|வருகை)/],
  }),
  policy("GET_NEXT_STOP", "READ_ONLY", true, {
    "en-SG": [/\b(next stop|what stop is next)\b/],
    "zh-SG": [/(下一站)/],
    "ms-SG": [/(hentian seterusnya)/],
    "ta-SG": [/(அடுத்த நிறுத்தம்)/],
  }),
  policy("GET_STOPS_REMAINING", "READ_ONLY", true, {
    "en-SG": [
      /\b(how many stops|stops (are )?left|nearly there|almost there)\b/,
    ],
    "zh-SG": [/(还有|剩下).*(几站|多少站)/],
    "ms-SG": [/(berapa hentian|hentian.*tinggal)/],
    "ta-SG": [/(எத்தனை நிறுத்தம்|மீதமுள்ள நிறுத்தம்)/],
  }),
  policy("GET_DESTINATION", "READ_ONLY", true, {
    "en-SG": [/\b(where|what stop)\b.*\b(getting off|destination|alight)\b/],
    "zh-SG": [/(目的地|哪里下车|在哪下车)/],
    "ms-SG": [/(destinasi|turun di mana)/],
    "ta-SG": [/(இலக்கு|எங்கே இறங்க)/],
  }),
  policy("HELP", "READ_ONLY", true, {
    "en-SG": [/^(help|help me|what can i (say|ask|do))$/],
    "zh-SG": [/^(帮助|可以问什么)$/],
    "ms-SG": [/^(bantuan|apa boleh saya tanya)$/],
    "ta-SG": [/^(உதவி|என்ன கேட்கலாம்)$/],
  }),
] as const;

export const assistantIntentTypes = [
  ...assistantIntentPolicies.map((item) => item.type),
  "UNKNOWN",
] as const satisfies readonly AssistantIntent["type"][];

export const assistantModelIntentTypes = assistantIntentPolicies
  .filter((item) => item.modelAllowed)
  .map((item) => item.type);

const policyMap = new Map(
  assistantIntentPolicies.map((item) => [item.type, item]),
);

export function assistantIntentPolicy(type: AssistantIntent["type"]) {
  return policyMap.get(type);
}

export function isAssistantIntentType(
  value: unknown,
): value is AssistantIntent["type"] {
  return (
    typeof value === "string" &&
    assistantIntentTypes.includes(value as AssistantIntent["type"])
  );
}

export function resolvePolicyIntent(
  transcript: string,
  preferredLocale: AssistantLocale,
): AssistantIntent {
  const localeOrder = [
    preferredLocale,
    ...(["en-SG", "zh-SG", "ms-SG", "ta-SG"] as const).filter(
      (locale) => locale !== preferredLocale,
    ),
  ];
  for (const policy of assistantIntentPolicies) {
    for (const locale of localeOrder) {
      const normalized = normalizeForIntent(transcript, locale);
      if (policy.aliases[locale]?.some((pattern) => pattern.test(normalized))) {
        return {
          type: policy.type,
          ...(["REQUEST_RAMP", "REQUEST_EXTRA_TIME"].includes(policy.type)
            ? { serviceNo: extractServiceNumber(normalized) }
            : {}),
        } as AssistantIntent;
      }
    }
  }
  return { type: "UNKNOWN" };
}

function policy(
  type: AssistantIntent["type"],
  risk: AssistantIntentRisk,
  modelAllowed: boolean,
  aliases: AssistantIntentPolicy["aliases"],
  contextValidator: AssistantIntentPolicy["contextValidator"] = alwaysValid,
): AssistantIntentPolicy {
  return {
    type,
    risk,
    aiConfidenceThreshold: risk === "STATE_CHANGE" ? 0.9 : 0.75,
    requiresConfirmation: risk === "STATE_CHANGE",
    modelAllowed,
    aliases,
    contextValidator,
  };
}

function normalizeForIntent(value: string, locale: AssistantLocale) {
  return value
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase(locale)
    .replace(/[?!.,。！？]/g, "")
    .replace(/\s+/g, " ");
}

function extractServiceNumber(transcript: string) {
  return transcript
    .match(/\b(?:service|bus)\s+([a-z]?\d+[a-z]?)\b/i)?.[1]
    ?.toUpperCase();
}
