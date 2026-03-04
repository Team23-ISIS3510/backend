export class CourseHelper {
  static extractCourseFromTitle(title: string): string | null {
    if (!title) return null;
    return title.trim() || null;
  }
}
