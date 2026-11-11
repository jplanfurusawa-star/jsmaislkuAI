import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'ALL_ISSUES_REPORT.md');
    if (!fs.existsSync(filePath)) {
      return new NextResponse('Report not found', { status: 404 });
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ALL_ISSUES_REPORT.md"',
      },
    });
  } catch (err: any) {
    return new NextResponse(err.message, { status: 500 });
  }
}
