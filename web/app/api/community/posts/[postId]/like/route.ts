import { NextResponse } from 'next/server';

const COMMUNITY_API_BASE_URL =
  process.env.COMMUNITY_API_BASE_URL ?? 'http://localhost:4010';

const COMMUNITY_API_HEADERS = {
  'Content-Type': 'application/json',
  'x-community-dev-token': 'visiongenie-community-dev-token',
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  const { postId } = await context.params;
  const response = await fetch(`${COMMUNITY_API_BASE_URL}/community/posts/${postId}/like`, {
    headers: COMMUNITY_API_HEADERS,
    method: 'POST',
  });

  return new NextResponse(null, { status: response.status });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  const { postId } = await context.params;
  const response = await fetch(`${COMMUNITY_API_BASE_URL}/community/posts/${postId}/like`, {
    headers: COMMUNITY_API_HEADERS,
    method: 'DELETE',
  });

  return new NextResponse(null, { status: response.status });
}
