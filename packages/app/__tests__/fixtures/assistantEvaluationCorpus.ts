import type {
  AssistantIntent,
  AssistantLocale,
} from "../../src/voiceAssistant/types";

export const assistantEvaluationCorpusVersion = "2026.09.1";

type IntentExample = {
  expected: Exclude<AssistantIntent["type"], "UNKNOWN">;
  text: string;
};

const examples: Record<AssistantLocale, IntentExample[]> = {
  "en-SG": [
    { expected: "CONFIRM", text: "confirm" },
    { expected: "CANCEL", text: "cancel" },
    { expected: "REQUEST_OPERATOR_HELP", text: "ask an operator for help" },
    { expected: "STOP_GUIDANCE", text: "stop navigation" },
    { expected: "REPEAT_GUIDANCE", text: "repeat that" },
    { expected: "REQUEST_ALIGHTING_HELP", text: "help me get off" },
    { expected: "REQUEST_EXTRA_TIME", text: "need extra boarding time" },
    { expected: "REQUEST_RAMP", text: "request the ramp" },
    { expected: "END_JOURNEY", text: "end my journey" },
    { expected: "GET_SHELTERED_ROUTE", text: "which route is sheltered" },
    { expected: "GET_CURRENT_STOP", text: "nearest bus stop" },
    { expected: "START_DIRECTIONS", text: "guide me to the bus stop" },
    { expected: "GET_ACTIVE_BUS", text: "what bus am I waiting for" },
    { expected: "GET_BUS_AT_STOP", text: "which bus is here" },
    { expected: "GET_ARRIVAL", text: "when is my bus coming" },
    { expected: "GET_NEXT_STOP", text: "next stop" },
    { expected: "GET_STOPS_REMAINING", text: "how many stops are left" },
    { expected: "GET_DESTINATION", text: "where am I getting off" },
    { expected: "HELP", text: "help" },
  ],
  "zh-SG": [
    { expected: "CONFIRM", text: "确认" },
    { expected: "CANCEL", text: "取消" },
    { expected: "REQUEST_OPERATOR_HELP", text: "请求人工操作员帮助" },
    { expected: "STOP_GUIDANCE", text: "停止导航" },
    { expected: "REPEAT_GUIDANCE", text: "再说一次" },
    { expected: "REQUEST_ALIGHTING_HELP", text: "下车需要帮助" },
    { expected: "REQUEST_EXTRA_TIME", text: "需要更多上车时间" },
    { expected: "REQUEST_RAMP", text: "请求斜坡板" },
    { expected: "END_JOURNEY", text: "结束行程" },
    { expected: "GET_SHELTERED_ROUTE", text: "哪条路线有盖" },
    { expected: "GET_CURRENT_STOP", text: "最近的巴士站" },
    { expected: "START_DIRECTIONS", text: "指引我去巴士站" },
    { expected: "GET_ACTIVE_BUS", text: "我的巴士" },
    { expected: "GET_BUS_AT_STOP", text: "什么巴士在这里" },
    { expected: "GET_ARRIVAL", text: "巴士什么时候到达" },
    { expected: "GET_NEXT_STOP", text: "下一站" },
    { expected: "GET_STOPS_REMAINING", text: "还有几站" },
    { expected: "GET_DESTINATION", text: "目的地" },
    { expected: "HELP", text: "帮助" },
  ],
  "ms-SG": [
    { expected: "CONFIRM", text: "sahkan" },
    { expected: "CANCEL", text: "batal" },
    { expected: "REQUEST_OPERATOR_HELP", text: "minta bantuan operator" },
    { expected: "STOP_GUIDANCE", text: "hentikan navigasi" },
    { expected: "REPEAT_GUIDANCE", text: "ulang sekali lagi" },
    { expected: "REQUEST_ALIGHTING_HELP", text: "tolong saya turun" },
    { expected: "REQUEST_EXTRA_TIME", text: "perlukan masa tambahan untuk naik" },
    { expected: "REQUEST_RAMP", text: "minta tanjakan" },
    { expected: "END_JOURNEY", text: "tamatkan perjalanan" },
    { expected: "GET_SHELTERED_ROUTE", text: "laluan mana berbumbung" },
    { expected: "GET_CURRENT_STOP", text: "perhentian bas terdekat" },
    { expected: "START_DIRECTIONS", text: "pandu saya ke perhentian bas" },
    { expected: "GET_ACTIVE_BUS", text: "bas saya" },
    { expected: "GET_BUS_AT_STOP", text: "bas apa di sini" },
    { expected: "GET_ARRIVAL", text: "bila bas tiba" },
    { expected: "GET_NEXT_STOP", text: "hentian seterusnya" },
    { expected: "GET_STOPS_REMAINING", text: "berapa hentian tinggal" },
    { expected: "GET_DESTINATION", text: "destinasi" },
    { expected: "HELP", text: "bantuan" },
  ],
  "ta-SG": [
    { expected: "CONFIRM", text: "உறுதிப்படுத்து" },
    { expected: "CANCEL", text: "ரத்து" },
    { expected: "REQUEST_OPERATOR_HELP", text: "இயக்குநர் உதவி வேண்டும்" },
    { expected: "STOP_GUIDANCE", text: "வழிகாட்டலை நிறுத்து" },
    { expected: "REPEAT_GUIDANCE", text: "மீண்டும் சொல்லுங்கள்" },
    { expected: "REQUEST_ALIGHTING_HELP", text: "இறங்க உதவி வேண்டும்" },
    { expected: "REQUEST_EXTRA_TIME", text: "ஏற கூடுதல் நேரம் வேண்டும்" },
    { expected: "REQUEST_RAMP", text: "சாய்வுப்பாதை வேண்டும்" },
    { expected: "END_JOURNEY", text: "பயணத்தை முடி" },
    { expected: "GET_SHELTERED_ROUTE", text: "கூரையுள்ள வழி எது" },
    { expected: "GET_CURRENT_STOP", text: "அருகிலுள்ள பேருந்து நிறுத்தம்" },
    { expected: "START_DIRECTIONS", text: "பேருந்து நிறுத்தத்திற்கு வழிகாட்டு" },
    { expected: "GET_ACTIVE_BUS", text: "என் பேருந்து" },
    { expected: "GET_BUS_AT_STOP", text: "எந்த பேருந்து இங்கே" },
    { expected: "GET_ARRIVAL", text: "பேருந்து எப்போது வரும்" },
    { expected: "GET_NEXT_STOP", text: "அடுத்த நிறுத்தம்" },
    { expected: "GET_STOPS_REMAINING", text: "எத்தனை நிறுத்தம் மீதம்" },
    { expected: "GET_DESTINATION", text: "இலக்கு" },
    { expected: "HELP", text: "உதவி" },
  ],
};

const visualVariants = [
  (text: string) => text,
  (text: string) => `  ${text}  `,
  (text: string) => `${text}?`,
  (text: string) => `${text}.`,
  (text: string) => `${text}!`,
  (text: string) => text.normalize("NFKD").normalize("NFKC"),
];

export const assistantEvaluationCorpus = Object.entries(examples).flatMap(
  ([locale, localeExamples]) =>
    localeExamples.flatMap((example) =>
      visualVariants.map((variant, variantIndex) => ({
        id: `${locale}:${example.expected}:${variantIndex}`,
        locale: locale as AssistantLocale,
        transcript: variant(example.text),
        expected: example.expected,
      })),
    ),
);
