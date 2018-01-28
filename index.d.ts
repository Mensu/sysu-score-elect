import * as pug from 'pug'

declare global {
  type Course = pug.Course
  type ElectPolicy = pug.ElectPolicy
  type ElectResult = pug.ElectResult
}

declare module 'pug' {
  interface Course {
    electable: boolean
    classId: string
    course: string
    type: string
    time: string
    teacher: string
    credit: number
    applicantNum: number
    remainingNum: number
    percent: number
  }

  interface ElectPolicy {
    type: string
    xkjdszid: string
    match: (course: Course) => boolean
    unelect?: string
    force?: boolean
  }

  interface ElectResult {
    err: {
      caurse: string
      code: number
    }
    code: number
  }
}
