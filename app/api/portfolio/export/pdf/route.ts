import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'

export async function GET() {
  try {
    const doc = new PDFDocument({ margin: 50 })
    
    // Gather chunks into a buffer array
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk))

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks))
      })
      doc.on('error', (err) => reject(err))

      // PDF Styling - Clean Vercel inspired print design
      doc.fillColor('#171717')
         .fontSize(24)
         .text('AURIC PRO', { continued: true })
         .fillColor('#888888')
         .fontSize(14)
         .text('  PORTFOLIO TRADE HISTORY', { align: 'right' })
      
      doc.strokeColor('#ebebeb')
         .lineWidth(1)
         .moveTo(50, 80)
         .lineTo(550, 80)
         .stroke()

      doc.moveDown(2)
      doc.fillColor('#171717')
         .fontSize(16)
         .text('Performance Summary')
      
      doc.moveDown(0.5)
      doc.fontSize(10)
         .fillColor('#4d4d4d')
         .text(`Report Generated: ${new Date().toLocaleString()}`)
         .text('Total Closed Trades: 5')
         .text('Win Rate: 60.00%')
         .text('Average Risk-to-Reward: 1.84 R')
         .text('Total Net Profit/Loss: $2,690.00 USD')
      
      doc.moveDown(2)
      doc.fontSize(14)
         .fillColor('#171717')
         .text('Closed Trade Logs')
      doc.moveDown(0.5)

      // Simple Table layout
      const tableTop = 230
      const colWidths = {
        ticket: 80,
        pair: 70,
        dir: 50,
        lots: 50,
        open: 70,
        close: 70,
        pnl: 110
      }

      // Draw headers
      doc.fontSize(9).fillColor('#171717')
      let currentX = 50
      doc.text('Ticket', currentX, tableTop)
      currentX += colWidths.ticket
      doc.text('Pair', currentX, tableTop)
      currentX += colWidths.pair
      doc.text('Dir', currentX, tableTop)
      currentX += colWidths.dir
      doc.text('Lots', currentX, tableTop)
      currentX += colWidths.lots
      doc.text('Open', currentX, tableTop)
      currentX += colWidths.open
      doc.text('Close', currentX, tableTop)
      currentX += colWidths.close
      doc.text('Net Profit', currentX, tableTop)

      // Draw header line
      doc.strokeColor('#ebebeb')
         .moveTo(50, tableTop + 15)
         .lineTo(550, tableTop + 15)
         .stroke()

      // Closed trades records
      const trades = [
        { ticket: '8491950', pair: 'XAUUSD', dir: 'BUY', lots: '0.08', open: '1938.00', close: '1958.00', pnl: '+$1,600.00' },
        { ticket: '8491910', pair: 'XAUUSD', dir: 'SELL', lots: '0.10', open: '1968.50', close: '1974.00', pnl: '-$550.00' },
        { ticket: '8491890', pair: 'XAUUSD', dir: 'BUY', lots: '0.20', open: '1950.40', close: '1953.25', pnl: '+$570.00' },
        { ticket: '8491845', pair: 'XAUUSD', dir: 'SELL', lots: '0.05', open: '1963.20', close: '1966.80', pnl: '-$180.00' },
        { ticket: '8491820', pair: 'XAUUSD', dir: 'BUY', lots: '0.10', open: '1955.50', close: '1968.00', pnl: '+$1,250.00' }
      ]

      doc.fillColor('#4d4d4d')
      trades.forEach((t, i) => {
        const y = tableTop + 25 + (i * 20)
        let cx = 50
        doc.text(t.ticket, cx, y)
        cx += colWidths.ticket
        doc.text(t.pair, cx, y)
        cx += colWidths.pair
        doc.text(t.dir, cx, y)
        cx += colWidths.dir
        doc.text(t.lots, cx, y)
        cx += colWidths.lots
        doc.text(t.open, cx, y)
        cx += colWidths.open
        doc.text(t.close, cx, y)
        cx += colWidths.close
        
        const isProfit = t.pnl.startsWith('+')
        doc.fillColor(isProfit ? '#0070f3' : '#ee0000')
           .text(t.pnl, cx, y)
           .fillColor('#4d4d4d')
      })

      // Add footer notes
      doc.fontSize(8)
         .fillColor('#888888')
         .text('AURIC PRO - Algorithmic Strategy Execution System Report.', 50, 700, { align: 'center' })

      doc.end()
    })

    return new Response(pdfBuffer as unknown as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="auric_portfolio_report.pdf"'
      }
    })
  } catch {
    return NextResponse.json({ error: 'Failed to generate PDF document' }, { status: 500 })
  }
}
