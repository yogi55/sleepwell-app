import { NextResponse } from 'next/server';

// A mock database to store baby sleep logs
type SleepLog = { id: number; babyName: string; startTime: string; endTime: string; notes?: string; };
let sleepLogs: SleepLog[] = [];
let nextId = 1;

// API endpoint to store a new sleep log
export async function POST(request: Request) {
    const body = await request.json();
    const { babyName, startTime, endTime, notes } = body;
    
    // Validate the request body
    if (!babyName || !startTime || !endTime) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    const newLog: SleepLog = { id: nextId++, babyName, startTime, endTime, notes };
    sleepLogs.push(newLog);
    return NextResponse.json(newLog, { status: 201 });
}

// API endpoint to retrieve sleep logs
export async function GET(request: Request) {
    return NextResponse.json(sleepLogs);
}