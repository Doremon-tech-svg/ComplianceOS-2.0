const GROQ_BASE =
    "https://api.groq.com/openai/v1/chat/completions";

const MODEL = "qwen/qwen3.8-27b"; // cheaper + faster

function getKey() {
    return import.meta.env.VITE_GROQ_API_KEY || "";
}

const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

// Prevent duplicate simultaneous requests
const pendingRequests = new Map();

export async function groqChat(
    messages,
    systemPrompt,
    {
        temperature = 0.7,
        maxTokens = 400,
        retries = 2,
    } = {}
) {
    const key = getKey();

    if (!key) {
        throw new Error("VITE_GROQ_API_KEY not set");
    }

    const body = {
        model: MODEL,
        max_tokens: maxTokens,
        temperature,
        messages: [
            {
                role: "system",
                content: systemPrompt,
            },
            ...messages,
        ],
    };

    // Create unique cache key
    const requestKey = JSON.stringify(body);

    // Return existing request if already running
    if (pendingRequests.has(requestKey)) {
        return pendingRequests.get(requestKey);
    }

    const requestPromise = (async () => {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await fetch(GROQ_BASE, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${key}`,
                    },
                    body: JSON.stringify(body),
                });

                if (res.ok) {
                    const data = await res.json();

                    return (
                        data?.choices?.[0]?.message?.content || ""
                    );
                }

                // Handle rate limit
                if (res.status === 429) {
                    const waitTime = 3000 * (attempt + 1);

                    console.warn(
                        `Rate limited. Waiting ${waitTime}ms`
                    );

                    await sleep(waitTime);
                    continue;
                }

                const errText = await res.text();

                throw new Error(
                    `Groq API error ${res.status}: ${errText}`
                );
            } catch (err) {
                if (attempt === retries) {
                    throw err;
                }

                await sleep(2000);
            }
        }

        throw new Error("Rate limit exceeded");
    })();

    pendingRequests.set(requestKey, requestPromise);

    try {
        return await requestPromise;
    } finally {
        pendingRequests.delete(requestKey);
    }
}