Add-Type -AssemblyName System.Drawing

$outputDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets\celebrations'))
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

function New-RoundedRectanglePath {
    param([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius)
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $Radius * 2
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-CelebrationImage {
    param(
        [string]$FileName,
        [string]$Message,
        [System.Drawing.Color]$StartColor,
        [System.Drawing.Color]$EndColor,
        [System.Drawing.Color]$TextColor
    )

    $bitmap = [System.Drawing.Bitmap]::new(640, 260, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $shadowPath = New-RoundedRectanglePath 34 35 572 192 56
    $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(90, 45, 27, 54))
    $graphics.FillPath($shadowBrush, $shadowPath)

    $panelPath = New-RoundedRectanglePath 24 22 572 192 56
    $panelBounds = [System.Drawing.RectangleF]::new(24, 22, 572, 192)
    $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new($panelBounds, $StartColor, $EndColor, 20)
    $graphics.FillPath($gradient, $panelPath)
    $outlinePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(230, 255, 255, 255), 7)
    $graphics.DrawPath($outlinePen, $panelPath)

    $sparkleBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(230, 255, 244, 156))
    foreach ($point in @(@(54, 42, 20), @(568, 54, 15), @(64, 182, 13), @(548, 184, 21))) {
        $graphics.FillEllipse($sparkleBrush, $point[0], $point[1], $point[2], $point[2])
    }

    $font = [System.Drawing.Font]::new('Malgun Gothic', 75, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $textBrush = [System.Drawing.SolidBrush]::new($TextColor)
    $textShadow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(105, 35, 18, 40))
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textBounds = [System.Drawing.RectangleF]::new(35, 24, 550, 182)
    $shadowBounds = [System.Drawing.RectangleF]::new(39, 30, 550, 182)
    $graphics.DrawString($Message, $font, $textShadow, $shadowBounds, $format)
    $graphics.DrawString($Message, $font, $textBrush, $textBounds, $format)

    $target = Join-Path $outputDirectory $FileName
    $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)

    $format.Dispose(); $textShadow.Dispose(); $textBrush.Dispose(); $font.Dispose()
    $sparkleBrush.Dispose(); $outlinePen.Dispose(); $gradient.Dispose(); $panelPath.Dispose()
    $shadowBrush.Dispose(); $shadowPath.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

New-CelebrationImage 'good.png' '좋아요!' ([System.Drawing.Color]::FromArgb(255, 255, 219, 79)) ([System.Drawing.Color]::FromArgb(255, 244, 145, 43)) ([System.Drawing.Color]::FromArgb(255, 74, 46, 20))
New-CelebrationImage 'cool.png' '멋져요!' ([System.Drawing.Color]::FromArgb(255, 141, 103, 234)) ([System.Drawing.Color]::FromArgb(255, 82, 47, 151)) ([System.Drawing.Color]::White)
New-CelebrationImage 'amazing.png' '대단해요!' ([System.Drawing.Color]::FromArgb(255, 248, 91, 127)) ([System.Drawing.Color]::FromArgb(255, 177, 40, 77)) ([System.Drawing.Color]::White)
