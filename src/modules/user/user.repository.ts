import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);
  private readonly COLLECTION = 'users';

  constructor(private readonly firebase: FirebaseService) {}

  private get col() {
    return this.firebase.getFirestore().collection(this.COLLECTION);
  }

  private toUser(id: string, data: FirebaseFirestore.DocumentData): User {
    return {
      id,
      email: data.email,
      name: data.name,
      phone: data.phone,
      isTutor: data.isTutor,
      courses: data.courses,
      rating: typeof data.rating === 'number' ? data.rating : undefined,
      description: data['description'],
      createdAt: this.firebase.parseDate(data.createdAt) ?? new Date(),
      updatedAt: this.firebase.parseDate(data.updatedAt) ?? new Date(),
    };
  }

  async findById(id: string): Promise<User | null> {
    const snap = await this.col.doc(id).get();
    if (!snap.exists) return null;
    return this.toUser(snap.id, snap.data()!);
  }

  async findByEmail(email: string): Promise<User | null> {
    const snap = await this.col.where('email', '==', email).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return this.toUser(doc.id, doc.data());
  }

  async create(id: string, dto: CreateUserDto): Promise<User> {
    const now = this.firebase.getTimestamp();
    const data = {
      ...dto,
      courses: dto.isTutor ? (dto.courses ?? []) : [],
      createdAt: now,
      updatedAt: now,
    };
    try {
      // Use create() instead of set() to make it atomic
      // create() will fail if document already exists
      await this.col.doc(id).create(data);
    } catch (error: any) {
      // Rethrow with proper context
      if (error.code === 6) {
        // ALREADY_EXISTS error
        throw new Error(`User with ID ${id} already exists`);
      }
      throw error;
    }
    return (await this.findById(id))!;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const docRef = this.col.doc(id);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundException(`User ${id} not found`);
  
    // Filter out undefined values before sending to Firestore
    const patch: Record<string, any> = { updatedAt: this.firebase.getTimestamp() };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.phone !== undefined) patch.phone = dto.phone;
    if (dto.isTutor !== undefined) patch.isTutor = dto.isTutor;
    if (dto.courses !== undefined) patch.courses = dto.courses;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.isTutor === false) patch.courses = [];
  
    await docRef.update(patch);
    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    await this.col.doc(id).delete();
  }
}
