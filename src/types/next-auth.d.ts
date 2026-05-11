import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      full_name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
    };
}
}

declare module "next-auth/jwt" {
  interface JWT {
    full_name?: string | null;
  }
}
