import { NextResponse } from 'next/server';

const COMMUNITY_API_BASE_URL =
  process.env.COMMUNITY_API_BASE_URL ?? 'http://localhost:4010';

const COMMUNITY_API_HEADERS = {
  'Content-Type': 'application/json',
  'x-community-dev-token': 'visiongenie-community-dev-token',
};

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  const { postId } = await context.params;
  const response = await fetch(`${COMMUNITY_API_BASE_URL}/community/posts/${postId}`, {
    headers: COMMUNITY_API_HEADERS,
    method: 'DELETE',
  });

  if (!response.ok) {
    let message = 'Failed to delete post.';

    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === 'string' && payload.message.trim()) {
        message = payload.message;
      }
    } catch {}

    return NextResponse.json({ message }, { status: response.status });
  }

  return new NextResponse(null, { status: response.status });
}
