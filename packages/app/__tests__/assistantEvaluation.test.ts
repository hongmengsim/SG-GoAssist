import { resolveRuleBasedIntent } from "../src/voiceAssistant/AssistantIntentProvider";
import {
  assistantKnowledgeArticles,
  searchAssistantKnowledge,
} from "../src/voiceAssistant/assistantKnowledge";
import { HybridAssistantTurnProvider } from "../src/voiceAssistant/AssistantTurnProvider";
import type { AssistantContext, AssistantLocale } from "../src/voiceAssistant/types";
import {
  assistantEvaluationCorpus,
  assistantEvaluationCorpusVersion,
} from "./fixtures/assistantEvaluationCorpus";

const locales: AssistantLocale[] = ["en-SG", "zh-SG", "ms-SG", "ta-SG"];

it.each(locales)("meets the multilingual intent target for %s", (locale) => {
  const examples = assistantEvaluationCorpus.filter(
    (example) => example.locale === locale,
  );
  expect(assistantEvaluationCorpusVersion).toMatch(/^\d{4}\.\d{2}\.\d+$/);
  expect(examples.length).toBeGreaterThanOrEqual(100);
  const correct = examples.filter(
    (example) =>
      resolveRuleBasedIntent(example.transcript, locale).type ===
      example.expected,
  ).length;
  expect(correct / examples.length).toBeGreaterThanOrEqual(0.9);
});

it.each(locales)("keeps title-based retrieval precision above 95% for %s", (locale) => {
  const articles = assistantKnowledgeArticles.filter(
    (article) => article.locale === locale,
  );
  const questions = articles.flatMap((article) =>
    [
      article.title,
      ` ${article.title} `,
      `${article.title}?`,
      `${article.title}.`,
      `${article.title}!`,
    ].map((query) => ({ query, articleId: article.id })),
  );
  expect(questions.length).toBeGreaterThanOrEqual(50);
  const correct = questions.filter(
    ({ query, articleId }) =>
      searchAssistantKnowledge(query, locale, 1)[0]?.article.id === articleId,
  ).length;
  expect(correct / questions.length).toBeGreaterThanOrEqual(0.95);

  for (let index = 0; index < 25; index += 1) {
    expect(
      searchAssistantKnowledge(`unrelated-zebra-topic-${index}`, locale),
    ).toHaveLength(0);
  }
});

it("recognises mixed-language commands while replying in the selected locale", () => {
  expect(resolveRuleBasedIntent("请 request ramp", "en-SG").type).toBe(
    "REQUEST_RAMP",
  );
  expect(resolveRuleBasedIntent("tolong request the ramp", "zh-SG").type).toBe(
    "REQUEST_RAMP",
  );
  expect(resolveRuleBasedIntent("next stop 是什么", "ms-SG").type).toBe(
    "GET_NEXT_STOP",
  );
});

it("never returns a safety article for an unrelated accessibility question", async () => {
  const context = assistantContext();
  const result = await new HybridAssistantTurnProvider().resolveTurn({
    turnId: "unrelated-safety",
    transcript: "How do I change accessibility text size?",
    context,
    deadlineAt: Date.now() + 8_000,
  });
  if (result.kind === "ANSWER") {
    expect(result.evidenceIds).not.toContain("ramp-safety:en-SG");
    expect(result.evidenceIds).not.toContain("emergency-help:en-SG");
  }
});

function assistantContext(): AssistantContext {
  return {
    locale: "en-SG",
    journeyStage: "WAITING_FOR_BUS",
    hasActiveJourney: true,
    onboard: false,
    currentStop: { busStopCode: "16171", description: "Demo stop" },
    selectedService: "151",
    destination: "Demo destination",
    nextStop: "Demo next stop",
    stopsRemaining: 2,
    busesAtStop: [],
    selectedBusAtStop: null,
    busArrivalSeconds: 120,
    rampStatus: "NO_BUS",
    alightingAssistanceStatus: null,
    walkingGuidanceActive: false,
    walkingRouteAvailable: true,
    preferences: {
      wheelchairAssistance: false,
      spokenGuidance: false,
      simplifiedJourney: false,
      vibrationAlerts: true,
    },
  };
}
