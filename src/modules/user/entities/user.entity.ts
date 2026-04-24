export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  isTutor: boolean;
  courses?: string[]; // only meaningful when isTutor = true
  rating?: number;    // average rating (1–5); only meaningful when isTutor = true
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  profilePictureUrl?: string;
}
