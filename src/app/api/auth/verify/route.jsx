import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export async function GET(request) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    
    if (!token) {
      return Response.json({ 
        valid: false, 
        error: "No token found" 
      }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    return Response.json({ 
      valid: true, 
      user: {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role
      }
    });
    
  } catch (error) {
    return Response.json({ 
      valid: false, 
      error: error.message 
    }, { status: 401 });
  }
}