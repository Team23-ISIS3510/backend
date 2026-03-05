export interface User {
  id: string; // Firebase Auth UID — used as Firestore document ID
  email: string;
  name: string;
  phone: string;
  isTutor: boolean;
  courses?: string[]; // only meaningful when isTutor = true
  createdAt: Date;
  updatedAt: Date;
}
