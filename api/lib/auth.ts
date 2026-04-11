import { supabase } from "./supabase.js";

export const authenticateToken = async (req: any, res: any) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token || token === "undefined") {
      console.error("Auth Error: No token provided");
      return { success: false, status: 401, error: "Authentication required" };
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error("Auth Error: Invalid token", error?.message);
      return { success: false, status: 403, error: "Invalid or expired session" };
    }
    
    return { success: true, user };
  } catch (err: any) {
    console.error("Auth Middleware Error:", err.message);
    return { success: false, status: 500, error: "Internal auth error" };
  }
};
