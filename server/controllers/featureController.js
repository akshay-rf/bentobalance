const Commitment = require('../models/Commitment');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
const supportedModel = process.env.GEMINI_MODEL || process.env.GENAI_MODEL || 'gemini-2.5-flash';
const ttsModel = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const fallbackTtsModel = process.env.GEMINI_TTS_FALLBACK_MODEL || 'gemini-2.5-pro-preview-tts';
const ttsVoice = process.env.GEMINI_TTS_VOICE || 'Kore';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const toWavBuffer = (pcmBuffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) => {
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    pcmBuffer.copy(buffer, 44);

    return buffer;
};

const normalizePlayableAudio = (audioBase64, mimeType) => {
    const type = String(mimeType || '').toLowerCase();
    if (type.includes('wav') || type.includes('mpeg') || type.includes('mp3') || type.includes('ogg')) {
        return { audio: audioBase64, mimeType: mimeType || 'audio/wav' };
    }

    const pcm = Buffer.from(audioBase64, 'base64');
    const wav = toWavBuffer(pcm);
    return { audio: wav.toString('base64'), mimeType: 'audio/wav' };
};

const extractTtsAudio = (payload) => {
    const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
    const chunks = [];
    let mimeType = null;

    for (const candidate of candidates) {
        const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
        for (const part of parts) {
            const inlineData = part?.inlineData || part?.inline_data;
            if (inlineData?.data) {
                chunks.push(Buffer.from(inlineData.data, 'base64'));
                if (!mimeType) mimeType = inlineData.mimeType || inlineData.mime_type || 'audio/pcm';
            } else if (part?.data) {
                chunks.push(Buffer.from(part.data, 'base64'));
                if (!mimeType) mimeType = part?.mimeType || part?.mime_type || 'audio/pcm';
            }
        }
    }

    if (chunks.length === 0) return { audio: null, mimeType: null };

    const combined = Buffer.concat(chunks);
    return { audio: combined.toString('base64'), mimeType };
};

const requestGeminiTts = async (modelName, textPrompt) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const payloads = [
        {
            contents: [{ parts: [{ text: textPrompt }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                maxOutputTokens: 8192,
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: ttsVoice
                        }
                    }
                }
            }
        },
        {
            contents: [{ parts: [{ text: textPrompt }] }],
            generation_config: {
                response_modalities: ['AUDIO'],
                max_output_tokens: 8192,
                speech_config: {
                    voice_config: {
                        prebuilt_voice_config: {
                            voice_name: ttsVoice
                        }
                    }
                }
            }
        }
    ];

    let lastStatus = null;
    let lastBody = null;

    for (const payload of payloads) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const bodyText = await response.text();
        lastStatus = response.status;
        lastBody = bodyText;

        if (!response.ok) {
            continue;
        }

        let json = {};
        try {
            json = bodyText ? JSON.parse(bodyText) : {};
        } catch (parseError) {
            continue;
        }

        const extracted = extractTtsAudio(json);
        if (extracted.audio) {
            return {
                ok: true,
                audio: extracted.audio,
                mimeType: extracted.mimeType,
                status: response.status
            };
        }
    }

    return {
        ok: false,
        status: lastStatus,
        body: lastBody
    };
};

const extractCoachOutput = (payload) => {
    const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
    const audioChunks = [];
    let mimeType = null;
    let text = '';

    for (const candidate of candidates) {
        const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
        for (const part of parts) {
            if (!text && typeof part?.text === 'string' && part.text.trim()) {
                text = part.text.trim();
            }

            const inlineData = part?.inlineData || part?.inline_data;
            if (inlineData?.data) {
                audioChunks.push(Buffer.from(inlineData.data, 'base64'));
                if (!mimeType) mimeType = inlineData.mimeType || inlineData.mime_type || 'audio/pcm';
            } else if (part?.data) {
                audioChunks.push(Buffer.from(part.data, 'base64'));
                if (!mimeType) mimeType = part?.mimeType || part?.mime_type || 'audio/pcm';
            }
        }
    }

    return {
        text,
        audio: audioChunks.length ? Buffer.concat(audioChunks).toString('base64') : null,
        mimeType
    };
};

// Session state storage per user (in production, use Redis or database)
const sessionStates = new Map();

const getSessionState = (userId, movement) => {
    const key = `${userId}:${movement}`;
    if (!sessionStates.has(key)) {
        sessionStates.set(key, {
            repCount: 0,
            lastFeedback: "",
            phase: "up",
            lastTimestamp: Date.now()
        });
    }
    return sessionStates.get(key);
};

const updateSessionState = (userId, movement, updates) => {
    const key = `${userId}:${movement}`;
    const state = getSessionState(userId, movement);
    Object.assign(state, updates);
    state.lastTimestamp = Date.now();
};

const requestGeminiCoachAnalysis = async ({ movement, frameBase64, sessionState }) => {
    const model = genAI.getGenerativeModel({
        model: supportedModel,
        generationConfig: {
            maxOutputTokens: 80,
            temperature: 0.4
        }
    });

    const movementKey = String(movement || '').toLowerCase();

    const exerciseRules = {
        squat: "- Check knee alignment with toes\n- Check back straightness\n- Check squat depth (hips below knees)",
        pushup: "- Check elbow angle (90 degrees)\n- Check body alignment (straight line)\n- Check depth and control",
        plank: "- Check hip sag (avoid)\n- Check straight line posture\n- Check shoulder position"
    };

    const rules = exerciseRules[movementKey] || "- Check overall form and alignment";

    const prompt = `You are a real-time fitness coach analyzing ${movementKey} form.

Rules for this frame:
- Only comment on what is visible in THIS frame
- Be specific and short (max 1 sentence, max 14 words)
- If form is correct, give positive reinforcement tied to visible posture
- If incorrect, give ONE specific correction
- Always mention one visible body part
- Avoid generic advice
- Respond in ONE complete sentence only
- The sentence MUST be grammatically complete
- Never cut off mid-sentence
- If giving correction, include body part + action

Bad example: "Keep your back."
Good example: "Keep your back straight during the squat."

Exercise-specific checks for ${movementKey}:
${rules}

Context:
- Rep count: ${sessionState.repCount}
- Last feedback: "${sessionState.lastFeedback || 'none'}"
- Current phase: ${sessionState.phase}

Respond ONLY with valid JSON (no markdown, no backticks, no extra text):
{"feedback": "your coaching cue here", "speak": true}`;

    const response = await model.generateContent([
        { text: prompt },
        {
            inlineData: {
                mimeType: 'image/jpeg',
                data: frameBase64
            }
        }
    ]);

    const responseText = response.response.text().trim();
    
    console.log('[Coach Analysis] Raw Gemini response:', responseText.substring(0, 300));

    const parsed = parseJsonObjectFromText(responseText);
    if (parsed && typeof parsed === 'object') {
        const feedback = String(parsed.feedback || parsed.comment || parsed.observed || '').trim();
        if (feedback) {
            return {
                feedback,
                speak: parsed.speak !== false
            };
        }
    }

    // Last resort: extract first sentence from raw text
    console.log('[Coach Analysis] Using fallback extraction');
    const sentences = responseText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 0 && sentences[0].trim().length > 5) {
        const firstSentence = sentences[0].trim()
            .replace(/^["\s{[]/, '')
            .replace(/["\s}\]]+$/, '')
            .trim();

        if (firstSentence.length > 2) {
            return {
                feedback: firstSentence,
                speak: true
            };
        }
    }

    return {
        feedback: 'Keep your form steady.',
        speak: true
    };
};

const escalationCopy = [
    'All clear: your plan is on track.',
    'Gentle nudge: one miss detected, recover today.',
    'Accountability mode: two misses in a row, adjust your schedule now.',
    'No Quit alert: three or more misses, ask a friend to check in.'
];

const trailingFragmentWords = new Set([
    'a', 'an', 'the', 'your', 'my', 'our', 'their',
    'to', 'of', 'for', 'with', 'in', 'on', 'at', 'by',
    'and', 'or', 'but', 'if', 'then', 'than',
    'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'do', 'does', 'did', 'have', 'has', 'had'
]);

const looksIncompleteSentence = (text) => {
    const cleaned = String(text || '').trim();
    if (!cleaned) return true;

    const words = cleaned.split(/\s+/).filter(Boolean);
    const lastWord = (words[words.length - 1] || '').toLowerCase().replace(/[^a-z]/g, '');
    const endsWithPunctuation = /[.!?]$/.test(cleaned);

    if (!endsWithPunctuation) return true;
    if (trailingFragmentWords.has(lastWord)) return true;
    if (words.length < 4) return true;
    return false;
};

const rewriteAsCompleteCue = async (model, movement, brokenCue) => {
    const rewritePrompt = `Rewrite this exercise coaching cue into exactly ONE complete sentence.
Rules: Keep same intent, max 15 words, end with punctuation, natural spoken tone, no markdown.
Movement: ${movement}
Cue: ${brokenCue}`;

    const rewritten = await model.generateContent(rewritePrompt);
    return rewritten.response.text().trim();
};

const hasVisualSpecificity = (text, movement) => {
    const cue = String(text || '').toLowerCase();
    if (!cue) return false;

    const actionHints = ['keep', 'lower', 'drive', 'brace', 'align', 'track', 'press', 'squeeze', 'engage', 'lift', 'sit', 'maintain', 'stack'];
    const movementTargets = {
        squat: ['chest', 'knees', 'hips', 'heels', 'toes', 'core'],
        pushup: ['elbows', 'hips', 'core', 'shoulders', 'chest', 'line'],
        plank: ['hips', 'core', 'shoulders', 'glutes', 'head', 'heels']
    };

    const targets = movementTargets[String(movement || '').toLowerCase()] || ['core', 'hips', 'shoulders', 'chest'];
    const hasAction = actionHints.some((token) => cue.includes(token));
    const hasTarget = targets.some((token) => cue.includes(token));
    return hasAction && hasTarget;
};

const rewriteAsVisualCue = async (model, movement, cueText) => {
    const prompt = `Rewrite this into exactly ONE complete coaching sentence based only on visible form.
Rules:
- Max 15 words.
- Mention one body part and one action.
- End with punctuation.
- No markdown or emojis.
Movement: ${movement}
Cue: ${cueText}`;

    const rewritten = await model.generateContent(prompt);
    return rewritten.response.text().trim();
};

const normalizeCueForCompare = (text) => String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isCueRecentlyUsed = (cue, recentCues) => {
    const normalized = normalizeCueForCompare(cue);
    if (!normalized) return false;
    return recentCues.some((item) => normalizeCueForCompare(item) === normalized);
};

const getCompleteCueFallback = (movement) => {
    const key = String(movement || '').toLowerCase();
    const options = {
        squat: [
            'Keep your chest up and drive through your heels.',
            'Sit back into your hips and keep your knees tracking over toes.',
            'Brace your core and stand tall through each squat rep.'
        ],
        pushup: [
            'Keep your body straight and lower with steady control.',
            'Keep elbows at a slight angle and press up in one line.',
            'Brace your core and avoid letting your hips sag on each rep.'
        ],
        plank: [
            'Keep your hips level and brace your core while breathing.',
            'Press the floor away and keep a straight line head to heels.',
            'Tighten glutes and core to hold a stable plank position.'
        ],
        default: [
            'Keep your form controlled and maintain steady breathing each rep.',
            'Move with control and keep your core engaged throughout the set.',
            'Stay balanced, breathe steadily, and keep your posture strong.'
        ]
    };

    const list = options[key] || options.default;
    return list[Math.floor(Math.random() * list.length)];
};

const movementCoachSpecs = {
    squat: {
        issueCodes: ['knees_caving', 'heels_lifting', 'chest_falling', 'depth_shallow', 'hip_shift', 'all_good'],
        cues: {
            knees_caving: [
                'Push your knees outward and keep them tracking over your toes.',
                'Drive your knees out so they stay aligned over your feet.'
            ],
            heels_lifting: [
                'Keep your heels grounded and shift your weight to mid-foot.',
                'Press through your heels and avoid rising onto your toes.'
            ],
            chest_falling: [
                'Lift your chest and brace your core as you descend.',
                'Keep your chest proud and avoid folding forward.'
            ],
            depth_shallow: [
                'Sit your hips back and lower until thighs are near parallel.',
                'Drop a little deeper while keeping your heels planted.'
            ],
            hip_shift: [
                'Center your hips and keep even pressure through both feet.',
                'Square your hips and rise evenly through both legs.'
            ],
            all_good: [
                'Great squat depth, keep your chest up and knees steady.',
                'Nice control, keep driving evenly through both heels.'
            ]
        }
    },
    pushup: {
        issueCodes: ['hips_sagging', 'elbows_flared', 'range_short', 'head_dropping', 'body_line_break', 'all_good'],
        cues: {
            hips_sagging: [
                'Brace your core and keep your hips in line with your shoulders.',
                'Lift your hips slightly to maintain a straight body line.'
            ],
            elbows_flared: [
                'Tuck your elbows to about forty-five degrees as you lower.',
                'Keep elbows closer to your sides on the way down.'
            ],
            range_short: [
                'Lower your chest a bit more before pressing up.',
                'Increase your range by lowering with controlled depth.'
            ],
            head_dropping: [
                'Keep your neck neutral and eyes slightly ahead.',
                'Align your head with your spine as you lower.'
            ],
            body_line_break: [
                'Hold a straight line from shoulders through hips to heels.',
                'Keep your body rigid and move as one unit.'
            ],
            all_good: [
                'Strong pushup line, keep that core brace and steady tempo.',
                'Great control, keep elbows tracking and body aligned.'
            ]
        }
    },
    plank: {
        issueCodes: ['hips_sagging', 'hips_piking', 'shoulders_collapsing', 'head_forward', 'core_unbraced', 'all_good'],
        cues: {
            hips_sagging: [
                'Lift your hips slightly and brace your core.',
                'Raise your hips to keep a straight line through your body.'
            ],
            hips_piking: [
                'Lower your hips a little to align shoulders, hips, and heels.',
                'Bring your hips down until your body forms one line.'
            ],
            shoulders_collapsing: [
                'Press the floor away and keep your shoulders active.',
                'Push through your shoulders to avoid sinking into the joints.'
            ],
            head_forward: [
                'Tuck your chin slightly and keep your neck neutral.',
                'Bring your head back in line with your spine.'
            ],
            core_unbraced: [
                'Tighten your core and glutes to stabilize your plank.',
                'Brace your midsection and hold steady breathing.'
            ],
            all_good: [
                'Great plank alignment, keep your core tight and breathing steady.',
                'Nice stability, keep shoulders active and hips level.'
            ]
        }
    }
};

const chooseRandom = (list) => list[Math.floor(Math.random() * list.length)];

const parseJsonObjectFromText = (text) => {
    const raw = String(text || '').trim();
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fenced && fenced[1]) {
            try {
                return JSON.parse(fenced[1].trim());
            } catch (nestedError) {
                return null;
            }
        }

        const objectMatch = raw.match(/\{[\s\S]*\}/);
        if (objectMatch && objectMatch[0]) {
            try {
                return JSON.parse(objectMatch[0]);
            } catch (nestedError) {
                return null;
            }
        }

        return null;
    }
};

const ensureSentence = (text) => {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
};

const isCompleteSentence = (text) => /[.!?]$/.test(String(text || '').trim());

const sanitizeCoachFeedback = (text) => {
    let cleaned = String(text || '').trim();
    if (!cleaned) return '';

    const parsed = parseJsonObjectFromText(cleaned);
    if (parsed && typeof parsed === 'object') {
        const fromJson = parsed.feedback || parsed.comment || parsed.observed || '';
        if (typeof fromJson === 'string' && fromJson.trim()) {
            cleaned = fromJson.trim();
        }
    }

    cleaned = cleaned
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .replace(/^\{?\s*"?feedback"?\s*:\s*"?/i, '')
        .replace(/"?\s*,\s*"?speak"?\s*:\s*(?:true|false)\s*\}?$/i, '')
        .replace(/^\s*["'{\[]+|["'}\]\s]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    return cleaned;
};

const buildMovementCueFromVision = (movement, rawVisionText) => {
    const key = String(movement || '').toLowerCase();
    const spec = movementCoachSpecs[key] || movementCoachSpecs.squat;
    const parsed = parseJsonObjectFromText(rawVisionText);
    const state = String(parsed?.state || '').toLowerCase();
    const issueCode = String(parsed?.issueCode || '').toLowerCase();

    if (state === 'fix' && spec.cues[issueCode]) {
        return ensureSentence(chooseRandom(spec.cues[issueCode]));
    }

    if ((state === 'good' || state === 'all_good') && spec.cues.all_good) {
        return ensureSentence(chooseRandom(spec.cues.all_good));
    }

    if (spec.cues[issueCode]) {
        return ensureSentence(chooseRandom(spec.cues[issueCode]));
    }

    const observed = ensureSentence(parsed?.observed || parsed?.cue || parsed?.comment || '');
    if (observed && hasVisualSpecificity(observed, key) && !looksIncompleteSentence(observed)) {
        return observed;
    }

    return '';
};

exports.fitnessCoach = async (req, res) => {
    const locals = {
        title: 'Form Coach - BentoBalance',
        description: 'Real-time posture and form coaching.'
    };

    res.render('dashboard/fitness-coach', {
        locals,
        userName: req.user.firstName,
        layout: '../views/layouts/dashboard'
    });
};

const getLocalCorrection = (movement) => {
    const choices = {
        squat: [
            'Keep your chest lifted and sit back into your heels for a stronger squat.',
            'Push your knees outward gently and make sure your spine stays neutral.',
            'Aim for your hips to go just below knee height while keeping your weight on your heels.'
        ],
        pushup: [
            'Keep your body in one straight line from head to heels as you lower down.',
            'Lower until your elbows reach about 90 degrees, then press back up with control.',
            'Tighten your core and avoid letting your hips sag or lift too high.'
        ],
        plank: [
            'Squeeze your glutes and keep your hips level for a strong plank hold.',
            'Press through your shoulders and keep your neck neutral while breathing steadily.',
            'Imagine holding a straight line from your head through your heels.'
        ]
    };
    const list = choices[movement] || ['Keep your form steady and move in control.'];
    return list[Math.floor(Math.random() * list.length)];
};

exports.analyzeExercise = async (req, res) => {
    const { movement, frame } = req.body;
    const userId = req.user?.id;

    if (!genAI || !frame || !userId) {
        return res.status(400).json({
            error: 'Gemini is not configured, camera frame is missing, or user not authenticated.'
        });
    }

    try {
        const movementKey = String(movement || '').toLowerCase();
        const base64Data = frame.split(',')[1];
        
        // Get session state for this user + movement
        const sessionState = getSessionState(userId, movementKey);

        // Call Gemini Flash for frame analysis (vision only, returns JSON with feedback + speak flag)
        const coachAnalysis = await requestGeminiCoachAnalysis({
            movement: movementKey,
            frameBase64: base64Data,
            sessionState
        });

        if (!coachAnalysis?.feedback) {
            return res.status(502).json({ error: 'Gemini returned empty coaching feedback.' });
        }

        // Ensure feedback is a string
        const rawFeedback = coachAnalysis.feedback;
        if (typeof rawFeedback !== 'string') {
            console.warn('Feedback is not a string, converting:', typeof rawFeedback, rawFeedback);
            return res.status(502).json({ error: 'Coach returned malformed feedback.' });
        }

        let feedbackRaw = sanitizeCoachFeedback(rawFeedback);

        if (!isCompleteSentence(feedbackRaw)) {
            const retryAnalysis = await requestGeminiCoachAnalysis({
                movement: movementKey,
                frameBase64: base64Data,
                sessionState
            });

            if (retryAnalysis?.feedback && typeof retryAnalysis.feedback === 'string') {
                feedbackRaw = sanitizeCoachFeedback(retryAnalysis.feedback);
            }
        }

        if (!isCompleteSentence(feedbackRaw)) {
            feedbackRaw = getLocalCorrection(movementKey);
        }

        let feedback = ensureSentence(feedbackRaw);

        if (!feedback) {
            feedback = getLocalCorrection(movementKey);
        }

        // Filter: Avoid repeating the exact same feedback
        if (feedback.toLowerCase() === sessionState.lastFeedback.toLowerCase()) {
            // Skip this response; return empty but success
            return res.json({
                correction: '',
                audio: null,
                mimeType: null,
                filtered: true
            });
        }

        // Update session state with new feedback
        updateSessionState(userId, movementKey, { lastFeedback: feedback });

        // Always attempt TTS generation for coaching feedback
        let audioBase64 = null;
        let audioMimeType = null;
        let ttsStatus = 'ok';

        if (feedback) {
            console.log('[TTS Generation] Attempting TTS for:', feedback);
            try {
                const ttsResponse = await requestGeminiTts(ttsModel, feedback);
                if (ttsResponse.ok && ttsResponse.audio) {
                    // Normalize audio to WAV format for browser compatibility
                    const normalized = normalizePlayableAudio(ttsResponse.audio, ttsResponse.mimeType);
                    audioBase64 = normalized.audio;
                    audioMimeType = normalized.mimeType;
                    console.log('[TTS Generation] Success, audio size:', audioBase64.length, 'bytes, mime:', audioMimeType);
                } else {
                    ttsStatus = ttsResponse?.status === 429 ? 'quota' : 'error';
                    console.log('[TTS Generation] Failed, response:', ttsResponse.status, ttsResponse.body?.substring?.(0, 200));
                }
            } catch (ttsError) {
                ttsStatus = 'error';
                console.error('[TTS Generation] Error:', ttsError.message);
            }
        }

        return res.json({
            correction: feedback,
            audio: audioBase64,
            mimeType: audioMimeType,
            ttsStatus
        });
    } catch (error) {
        console.log('Exercise analysis failed:', error);
        return res.status(500).json({
            error: 'Gemini coach failed to process this frame.',
            details: error.message
        });
    }
};

exports.commitments = async (req, res) => {
    const locals = {
        title: 'Habit Tracker - BentoBalance',
        description: 'Build lasting habits with daily tracking, AI insights, and smart reminders.'
    };

    const commitments = await Commitment.find({ user: req.user.id }).sort({ createdAt: -1 });
    const enrichedCommitments = commitments.map((item) => ({
        ...item.toObject(),
        escalationMessage: escalationCopy[Math.min(item.escalationLevel, escalationCopy.length - 1)]
    }));

    const totalCommitments = commitments.length;
    const activeCommitments = commitments.filter(c => c.status === 'active').length;
    const pausedCommitments = commitments.filter(c => c.status === 'paused').length;

    let aiTip = "Keep up the great work!";
    if (genAI) {
        try {
            const model = genAI.getGenerativeModel({
                model: supportedModel,
                generationConfig: { maxOutputTokens: 120 }
            });
            const prompt = `As an AI habit coach, provide a brief, encouraging tip for this user based on their habits: ${enrichedCommitments.map(c => `${c.title} (streak: ${c.streak} days)`).join(', ')}. Focus on motivation and one actionable suggestion. Keep under 80 words.`;
            const result = await model.generateContent(prompt);
            const aiText = result.response.text().trim();
            if (aiText) {
                aiTip = aiText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            }
        } catch (error) {
            console.log('AI tip generation failed:', error);
        }
    }

    res.render('dashboard/commitments', {
        locals,
        userName: req.user.firstName,
        commitments: enrichedCommitments,
        totalCommitments,
        activeCommitments,
        pausedCommitments,
        aiTip,
        layout: '../views/layouts/dashboard'
    });
};

exports.addCommitment = async (req, res) => {
    let title = (req.body.title || '').trim();
    if (!title) {
        return res.redirect('/dashboard/commitments');
    }

    // Use AI to refine the title
    if (genAI) {
        try {
            const model = genAI.getGenerativeModel({
                model: supportedModel,
                generationConfig: { maxOutputTokens: 80 }
            });
            const prompt = `Refine this habit/commitment title to be more specific, actionable, and achievable: "${title}". Keep it concise, under 50 words.`;
            const result = await model.generateContent(prompt);
            const refinedTitle = result.response.text().trim();
            if (refinedTitle && refinedTitle.length < 100) {
                title = refinedTitle;
            }
        } catch (error) {
            console.log('AI title refinement failed:', error);
        }
    }

    await Commitment.create({
        user: req.user.id,
        title,
        dailyTarget: req.body.dailyTarget || 'Complete once daily',
        reminderTime: req.body.reminderTime || '20:00'
    });

    return res.redirect('/dashboard/commitments');
};

exports.checkInCommitment = async (req, res) => {
    const commitment = await Commitment.findOne({ _id: req.params.id, user: req.user.id });
    if (!commitment || commitment.status !== 'active') {
        return res.redirect('/dashboard/commitments');
    }

    // Always increment for testing
    commitment.streak += 1;
    commitment.missedCount = 0;
    commitment.escalationLevel = 0;
    commitment.lastCheckInAt = new Date();
    await commitment.save();

    return res.redirect('/dashboard/commitments');
};

exports.missCommitment = async (req, res) => {
    const commitment = await Commitment.findOne({ _id: req.params.id, user: req.user.id });
    if (!commitment || commitment.status !== 'active') {
        return res.redirect('/dashboard/commitments');
    }

    commitment.missedCount += 1;
    commitment.escalationLevel = Math.min(3, commitment.escalationLevel + 1);
    if (commitment.streak > 0) {
        commitment.streak -= 1;
    }
    await commitment.save();

    return res.redirect('/dashboard/commitments');
};

exports.pauseCommitment = async (req, res) => {
    const commitment = await Commitment.findOne({ _id: req.params.id, user: req.user.id });
    if (!commitment) {
        return res.redirect('/dashboard/commitments');
    }

    commitment.status = 'paused';
    await commitment.save();

    return res.redirect('/dashboard/commitments');
};

exports.resumeCommitment = async (req, res) => {
    const commitment = await Commitment.findOne({ _id: req.params.id, user: req.user.id });
    if (!commitment) {
        return res.redirect('/dashboard/commitments');
    }

    commitment.status = 'active';
    await commitment.save();

    return res.redirect('/dashboard/commitments');
};

exports.deleteCommitment = async (req, res) => {
    await Commitment.deleteOne({ _id: req.params.id, user: req.user.id });
    return res.redirect('/dashboard/commitments');
};
