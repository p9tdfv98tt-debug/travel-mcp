import Foundation
import AVFoundation

let outputPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "/tmp/travel_user_voice.m4a"
let url = URL(fileURLWithPath: outputPath)

// Remove existing file if present
try? FileManager.default.removeItem(at: url)

let settings: [String: Any] = [
    AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
    AVSampleRateKey: 16000.0,
    AVNumberOfChannelsKey: 1,
    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
]

do {
    let recorder = try AVAudioRecorder(url: url, settings: settings)
    guard recorder.record() else {
        fputs("ERROR: Failed to start recording\n", stderr)
        exit(1)
    }
    
    // Signal to parent process that recording is live
    print("RECORDING_STARTED")
    fflush(stdout)

    // Wait for Enter key on stdin or 30 seconds max
    let group = DispatchGroup()
    group.enter()
    DispatchQueue.global().async {
        _ = readLine()
        group.leave()
    }
    _ = group.wait(timeout: .now() + 30.0)

    recorder.stop()
    print("RECORDING_FINISHED")
    fflush(stdout)
    exit(0)
} catch {
    fputs("ERROR: \(error)\n", stderr)
    exit(1)
}
