import { createHmac, randomUUID, timingSafeEqual } from "crypto";

type Operator = "+" | "-" | "*";

type LoginChallengeRecord = {
    id: string;
    question: string;
    answer: number;
    expiresAt: number;
};

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_ANSWER_LENGTH = 4;
const store = new Map<string, LoginChallengeRecord>();
const proofSecret =
    process.env.LOGIN_CHALLENGE_SECRET ||
    process.env.JWT_SECRET ||
    "doctor-login-challenge-secret";

function cleanupExpiredChallenges() {
    const now = Date.now();
    for (const [id, challenge] of store.entries()) {
        if (challenge.expiresAt <= now) {
            store.delete(id);
        }
    }
}

function toBase64Url(value: string) {
    return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string) {
    return Buffer.from(value, "base64url").toString("utf8");
}

function signProof(payload: string) {
    return createHmac("sha256", proofSecret).update(payload).digest("base64url");
}

function buildVerificationToken(challengeId: string, expiresAt: number) {
    const payload = toBase64Url(JSON.stringify({ challengeId, expiresAt }));
    const signature = signProof(payload);
    return `${payload}.${signature}`;
}

function pickOperator(): Operator {
    const operators: Operator[] = ["+", "-", "*"];
    return operators[Math.floor(Math.random() * operators.length)];
}

function createMathQuestion() {
    while (true) {
        const operator = pickOperator();
        let left = Math.floor(Math.random() * 8) + 1;
        let right = Math.floor(Math.random() * 8) + 1;

        if (operator === "-") {
            if (right > left) {
                [left, right] = [right, left];
            }
        }

        const answer =
            operator === "+"
                ? left + right
                : operator === "-"
                    ? left - right
                    : left * right;

        if (String(answer).length <= MAX_ANSWER_LENGTH) {
            return {
                question: `${left} ${operator} ${right} = ?`,
                answer,
            };
        }
    }
}

export function createLoginChallenge() {
    cleanupExpiredChallenges();

    const id = randomUUID();
    const { question, answer } = createMathQuestion();
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;

    store.set(id, {
        id,
        question,
        answer,
        expiresAt,
    });

    return {
        challengeId: id,
        question,
        expiresAt: new Date(expiresAt).toISOString(),
    };
}

export function verifyLoginChallenge(challengeId: string, rawAnswer: string | number) {
    cleanupExpiredChallenges();

    const challenge = store.get(challengeId);
    if (!challenge) {
        return { ok: false as const, reason: "invalid" as const };
    }

    if (challenge.expiresAt <= Date.now()) {
        store.delete(challengeId);
        return { ok: false as const, reason: "expired" as const };
    }

    const parsedAnswer = Number(String(rawAnswer).trim());
    if (!Number.isFinite(parsedAnswer) || parsedAnswer !== challenge.answer) {
        return { ok: false as const, reason: "incorrect" as const };
    }

    store.delete(challengeId);
    return {
        ok: true as const,
        expiresAt: new Date(challenge.expiresAt).toISOString(),
        verificationToken: buildVerificationToken(challengeId, challenge.expiresAt),
    };
}

export function validateLoginChallengeProof(challengeId: string, verificationToken: string) {
    try {
        const [payload, signature] = String(verificationToken || "").split(".");
        if (!payload || !signature) {
            return { ok: false as const, reason: "invalid" as const };
        }

        const expectedSignature = signProof(payload);
        const provided = Buffer.from(signature);
        const expected = Buffer.from(expectedSignature);
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
            return { ok: false as const, reason: "invalid" as const };
        }

        const parsed = JSON.parse(fromBase64Url(payload)) as {
            challengeId?: string;
            expiresAt?: number;
        };

        if (!parsed.challengeId || parsed.challengeId !== challengeId) {
            return { ok: false as const, reason: "invalid" as const };
        }

        if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
            return { ok: false as const, reason: "expired" as const };
        }

        return { ok: true as const };
    } catch {
        return { ok: false as const, reason: "invalid" as const };
    }
}
