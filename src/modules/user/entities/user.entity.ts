export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  isTutor: boolean;
  courses?: string[];
  description?: string;
  rating?: number;
  createdAt: Date;
  updatedAt: Date;
}
