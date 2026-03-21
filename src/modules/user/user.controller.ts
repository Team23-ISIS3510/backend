import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({
    summary: 'Create a user profile',
    description:
      'Creates a Firestore user document for a Firebase Auth UID. ' +
      'Typically called right after `POST /auth/register` (which already does this internally). ' +
      'Use this endpoint when you need to manually create a profile for an existing Firebase Auth user.',
  })
  @ApiParam({ name: 'uid', description: 'Firebase Auth UID of the user' })
  @ApiResponse({ status: 201, type: UserResponseDto, description: 'User profile created.' })
  @ApiResponse({ status: 409, description: 'A profile already exists for this UID.' })
  @Post(':uid')
  create(@Param('uid') uid: string, @Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.userService.create(uid, dto);
  }

  @ApiOperation({ summary: 'Get user profile by ID' })
  @ApiParam({ name: 'id', description: 'Firebase Auth UID / Firestore document ID' })
  @ApiResponse({ status: 200, type: UserResponseDto, description: 'User profile found.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @Get(':id')
  findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.userService.getUserById(id);
  }

  @ApiOperation({ summary: 'Update user profile' })
  @ApiParam({ name: 'id', description: 'Firebase Auth UID / Firestore document ID' })
  @ApiResponse({ status: 200, type: UserResponseDto, description: 'User profile updated.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<UserResponseDto> {
    return this.userService.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete user profile' })
  @ApiParam({ name: 'id', description: 'Firebase Auth UID / Firestore document ID' })
  @ApiResponse({ status: 204, description: 'User deleted.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string): Promise<void> {
    return this.userService.delete(id);
  }
}
