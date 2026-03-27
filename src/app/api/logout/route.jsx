export async function POST() {
  try {
    // Create response
    const response = Response.json({
      success: true,
      message: "Logout successful",
    });

    // Clear the auth cookie
    response.headers.set(
      "Set-Cookie",
      `auth_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`
    );

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}