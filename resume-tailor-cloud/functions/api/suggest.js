
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });

export async function onRequestPost({ request, env }) {
  try {
    if (!env.GROQ_API_KEY) {
      return json({ error: 'Groq API key is not configured.' }, 500);
    }

    const body = await request.json();
    const action = String(body.action || '');
    const job = String(body.job || '').slice(0, 18000);
    const resume = body.resume || {};
    const text = String(body.text || '').trim().slice(0, 2500);

    const actions = {
      improve: 'Improve the clarity, professionalism, and impact of this resume bullet.',
      keywords: 'Naturally incorporate relevant keywords from the job posting, but only where supported by the applicant’s actual experience.',
      concise: 'Make this resume bullet shorter, clearer, and more direct.',
      title: 'Suggest a concise professional headline matching the target position in the job posting. The headline represents the job being applied for, not a claim of previous employment.'
    };

    if (!Object.hasOwn(actions, action)) {
      return json({ error: 'Invalid suggestion action.' }, 400);
    }

    if (action !== 'title' && !text) {
      return json({ error: 'Select a bullet to improve.' }, 400);
    }

    if (action === 'title' && !job.trim()) {
      return json({ error: 'A job description is required.' }, 400);
    }

    const system = [
      'You are a careful professional resume editor.',
      'Preserve factual accuracy.',
      'Never invent jobs, qualifications, certifications, metrics, accomplishments, or experience.',
      'Never imply the applicant performed work that is not supported by the supplied resume.',
      'Do not add keyword stuffing.',
      'Avoid em dashes.',
      'Return only the suggested replacement text.',
      'Do not include quotation marks, markdown, explanations, or labels.'
    ].join(' ');

    const user = [
      `TASK: ${actions[action]}`,
      '',
      `JOB POSTING:\n${job}`,
      '',
      `CURRENT RESUME:\n${JSON.stringify(resume).slice(0, 18000)}`,
      '',
      action === 'title'
        ? 'Return one short target-position headline, ideally the exact job title from the posting.'
        : `ORIGINAL BULLET:\n${text}\n\nReturn exactly one improved bullet without a bullet symbol.`
    ].join('\n');

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature: 0.3,
          max_completion_tokens: 500
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return json({
        error: data.error?.message || 'Groq request failed.'
      }, response.status);
    }

    const suggestion = String(
      data.choices?.[0]?.message?.content || ''
    )
      .trim()
      .replace(/^["'•\-\s]+/, '')
      .replace(/["'\s]+$/, '')
      .replace(/\u2014/g, ', ');

    if (!suggestion) {
      return json({
        error: 'The AI returned an empty suggestion. Please try again.'
      }, 502);
    }

    return json({ suggestion });

  } catch (error) {
    return json({
      error: 'Unable to generate suggestion: ' + error.message
    }, 500);
  }
}
