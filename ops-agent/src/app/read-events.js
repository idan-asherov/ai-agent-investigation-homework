export async function readEvents(response, onEvent) {
  if (!response.body) {
    throw new Error("ReadableStream not supported or empty response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed);
        onEvent(event);
      } catch (err) {
        console.error("Failed to parse stream event JSON:", trimmed, err);
      }
    }
  }

  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer.trim());
      onEvent(event);
    } catch (err) {
      console.error("Failed to parse remaining buffer:", buffer, err);
    }
  }
}
