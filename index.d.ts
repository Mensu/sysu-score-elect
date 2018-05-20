import * as pug from 'pug'

declare global {
  type Course = pug.Course
  type ElectPolicy = pug.ElectPolicy
  type ElectResult = pug.ElectResult
  type ScoreResult = pug.ScoreResult
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
      cause?: string
    }
    code: number
  }

  interface ScoreResult {
    classRank: string
    totalRank: string
    type: '公选' | '公必' | '专选' | '专必'
    course: string
    credit: number
    score: string
    year: string
    term: '1' | '2' | '3'
    studentId: string
    teacher: string
    scoreList: {
      /** 分项成绩 */
      FXCJ: string
      /** 分项名称 */
      FXMC: string
      /** 默认权重 */
      MRQZ: string
    }[]
    resource_id: string
  }
}
