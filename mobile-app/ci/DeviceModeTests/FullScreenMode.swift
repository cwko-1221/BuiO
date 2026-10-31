import XCTest

// Disposable CI simulator only. Select the same OS mode the user requested;
// UIRequiresFullScreen cannot override iPadOS 26's Windowed Apps setting.
final class FullScreenMode: XCTestCase {
    func testEnableFullScreenApps() throws {
        continueAfterFailure = false
        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.launch()
        let multitasking = settings.staticTexts["Multitasking & Gestures"].firstMatch
        _ = multitasking.waitForExistence(timeout: 15)
        for _ in 0..<5 {
            if multitasking.exists && multitasking.isHittable { break }
            let sidebar = settings.tables.firstMatch.exists ? settings.tables.firstMatch : settings.collectionViews.firstMatch
            XCTAssertTrue(sidebar.exists, settings.debugDescription)
            sidebar.swipeUp()
        }
        XCTAssertTrue(multitasking.exists && multitasking.isHittable, settings.debugDescription)
        multitasking.tap()
        let fullScreen = settings.staticTexts["Full Screen Apps"].firstMatch
        XCTAssertTrue(fullScreen.waitForExistence(timeout: 15), settings.debugDescription)
        fullScreen.tap()
        let evidence = XCTAttachment(screenshot: settings.screenshot())
        evidence.name = "iPadOS Full Screen Apps selected"
        evidence.lifetime = .keepAlways
        add(evidence)
        print(settings.debugDescription)
        settings.terminate()
    }
}
