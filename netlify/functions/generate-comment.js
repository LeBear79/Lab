exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "OPENAI_API_KEY mangler i Netlify."
      })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const studentId = String(body.studentId || "Elev");
    const records = Array.isArray(body.records) ? body.records : [];

    if (!records.length) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Ingen observasjoner ble sendt."
        })
      };
    }

    const observations = records.map((r, i) => ({
      nr: i + 1,
      dato: r.date || "",
      aktivitet: r.activity || "",
      status: r.status || "",
      observasjoner: Array.isArray(r.observations)
        ? r.observations
        : [],
      laerernotat: r.teacherNote || "",
      labrapportkommentarer: Array.isArray(r.reportComments)
        ? r.reportComments
        : [],
      labrapportnotat: r.reportNote || ""
    }));

    const instructions = `
Du hjelper en norsk naturfaglærer med å formulere
et utkast til en generell elevkommentar.

Skriv på norsk bokmål, i du-form, med et profesjonelt,
konkret og balansert lærerspråk.

Bruk KUN opplysningene som finnes i observasjonene.
Ikke finn på prestasjoner, egenskaper eller utvikling.

Trekk fram mønstre som går igjen, både styrker og
relevante utviklingsområder.

Ikke nevn elevnummer, datoer, antall registreringer
eller at teksten er laget av KI.

Ikke diagnostiser eller spekuler i årsaker.

Skriv normalt ett sammenhengende avsnitt på omtrent
80–140 ord.

Formuler teksten som et redigerbart vurderingsutkast,
ikke som en endelig beslutning.
`;

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-5-mini",
          instructions: instructions,
          input:
            `Pseudonym: ${studentId}\n` +
            `Registrerte lærerobservasjoner:\n` +
            JSON.stringify(observations, null, 2),
          max_output_tokens: 450
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error", data);

      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Feil fra KI-tjenesten."
        })
      };
    }

    let comment = data.output_text;

    if (!comment && Array.isArray(data.output)) {
      comment = data.output
        .flatMap(item =>
          Array.isArray(item.content) ? item.content : []
        )
        .map(part => part.text || "")
        .filter(Boolean)
        .join("\n")
        .trim();
    }

    if (!comment) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "KI-tjenesten returnerte ingen tekst."
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({ comment: comment })
    };

  } catch (err) {
    console.error(err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Kunne ikke generere kommentar."
      })
    };
  }
};
