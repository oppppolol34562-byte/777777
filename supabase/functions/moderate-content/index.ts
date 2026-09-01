import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ModerationRequest {
  mediaUrl: string;
  mediaType: string;
}

interface CategoryScores {
  violence: number;
  sexual: number;
  graphic: number;
  hate: number;
  self_harm: number;
  exploitation: number;
}

interface ModerationResult {
  status: "safe" | "review" | "rejected";
  safe: boolean;
  score: number;
  categories: CategoryScores;
  moderated_at: string;
}

/**
 * SafetyModerationService — analyzes uploaded media for policy violations.
 * Returns structured scores per category. Currently uses a heuristic/mock
 * analyzer; designed to be replaced with a real provider (e.g. AWS Rekognition,
 * Google Cloud Vision, OpenAI moderation) by swapping the analyzeMedia function.
 */
function analyzeMedia(_mediaUrl: string, _mediaType: string): ModerationResult {
  // Placeholder heuristic analyzer.
  // In production this would call an external moderation API.
  // Returns "safe" with near-zero scores by default.
  const categories: CategoryScores = {
    violence: 0.01,
    sexual: 0.0,
    graphic: 0.01,
    hate: 0.0,
    self_harm: 0.0,
    exploitation: 0.0,
  };

  const maxScore = Math.max(...Object.values(categories));
  let status: ModerationResult["status"] = "safe";

  if (maxScore >= 0.7) {
    status = "rejected";
  } else if (maxScore >= 0.3) {
    status = "review";
  }

  return {
    status,
    safe: status === "safe",
    score: maxScore,
    categories,
    moderated_at: new Date().toISOString(),
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { mediaUrl, mediaType } = (await req.json()) as ModerationRequest;

    if (!mediaUrl) {
      return new Response(
        JSON.stringify({ error: "mediaUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = analyzeMedia(mediaUrl, mediaType || "image");

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Moderation failed",
        status: "review",
        safe: false,
        score: 1.0,
        categories: {},
        moderated_at: new Date().toISOString(),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
